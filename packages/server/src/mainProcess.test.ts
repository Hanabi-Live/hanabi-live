// cspell:words classid datname locktype objid relname
import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { z } from "zod";
import { decodeCustomDeck } from "./customDeck";
import { GoRandom, seedToInt64 } from "./engine/goRandom";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import { redisFixture } from "./experimental/redisFixture";
import { winningDeck } from "./experimental/scenarios";
import { expectedSchemaVersion } from "./migrationFiles";
import { importReplay } from "./replayImport";
import { decodeSessionCookie } from "./sessionCookie";

const ROOT = path.resolve(__dirname, "../../..");
const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);
const wireHistorySchema = SERVER_COMMAND_SCHEMAS.gameHistory
  .unwrap()
  .element.unwrap()
  .extend({
    datetimeStarted: z.coerce.date(),
    datetimeFinished: z.coerce.date(),
  })
  .readonly()
  .array()
  .readonly();

interface CheckpointProgress {
  readonly game_id: number;
  readonly revision: number;
  readonly turn: number;
  readonly active_player_index: number;
  readonly clocks: readonly number[];
}

const rustProgressSnapshotSchema = z.object({
  game_id: z.number().int().positive(),
  game: z.object({
    turn: z.number().int().nonnegative(),
    activePlayerIndex: z.number().int().nonnegative(),
  }),
  clocks: z.number().array().readonly(),
});
const rustProgressPhaseSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("pregame") }),
  z.object({ phase: z.literal("replay") }),
  z.object({ phase: z.literal("live"), snapshot: rustProgressSnapshotSchema }),
]);
const rustProgressTableSchema = z.object({
  format: z.literal("hanabi-live-native-rust-2"),
  phase: rustProgressPhaseSchema,
});

async function bounded<T>(
  promise: Promise<T>,
  description: string,
  milliseconds = 10_000,
): Promise<T> {
  const timeout = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    timeout.reject(new Error(`Timed out: ${description}`));
  }, milliseconds);
  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const closed = once(child, "close");
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 3000);
  try {
    await bounded(closed, "compiled process shutdown", 5000);
  } finally {
    clearTimeout(timer);
  }
}

async function prepareRoot(
  directory: string,
  database: Awaited<ReturnType<typeof evaluationDatabase>>,
  domain: string,
) {
  const distribution = path.join(directory, "packages/server/dist");
  await mkdir(path.dirname(distribution), { recursive: true });
  await cp(path.join(ROOT, "packages/server/dist"), distribution, {
    recursive: true,
  });
  await mkdir(path.join(directory, "public/js/bundles"), { recursive: true });
  await mkdir(path.join(directory, "public/img"), { recursive: true });
  await mkdir(path.join(directory, "install"), { recursive: true });
  await mkdir(path.join(directory, "misc"), { recursive: true });
  await Promise.all([
    symlink(
      path.join(ROOT, "node_modules"),
      path.join(directory, "node_modules"),
      "dir",
    ),
    symlink(
      path.join(ROOT, "install/migrations"),
      path.join(directory, "install/migrations"),
      "dir",
    ),
    symlink(
      path.join(ROOT, "misc/word_list.txt"),
      path.join(directory, "misc/word_list.txt"),
    ),
    symlink(
      path.join(ROOT, "public/img/favicon.ico"),
      path.join(directory, "public/img/favicon.ico"),
    ),
    writeFile(path.join(directory, "public/js/bundles/version.txt"), "1\n"),
  ]);
  const { connection } = database;
  const environment = {
    DOMAIN: domain,
    SESSION_SECRET: "synthetic-process-smoke-secret-".repeat(8),
    PORT: "0",
    LOCALHOST_PORT: "0",
    DB_HOST: connection.host,
    DB_PORT: String(connection.port),
    DB_USER: connection.username,
    DB_PASSWORD:
      connection.password === ""
        ? "unused-local-trust-password"
        : connection.password,
    DB_NAME: connection.database,
  };
  const contents = Object.entries(environment)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
  await writeFile(path.join(directory, ".env"), `${contents}\n`);
}

function startProcess(directory: string, goPort?: number, rust = false) {
  let executable = process.execPath;
  if (rust) {
    executable = path.join(directory, "hanabi-rust-poc");
  } else if (goPort !== undefined) {
    executable = path.join(directory, "hanabi-live");
  }
  const child = spawn(
    executable,
    goPort === undefined && !rust ? ["packages/server/dist/main.js"] : [],
    {
      cwd: directory,
      env: {
        PATH: process.env["PATH"],
        HOME: directory,
        TMPDIR: directory,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const ready = Promise.withResolvers<string>();
  let waiter: typeof ready | undefined = ready;
  let output = "";
  let lineBuffer = "";
  function collect(chunk: Buffer) {
    output = (output + chunk.toString()).slice(-32_768);
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split("\n");
    const unfinished = lines.pop();
    assertDefined(unfinished, "Missing partial process output.");
    lineBuffer = unfinished;
    for (const line of lines) {
      const address =
        goPort !== undefined && line.includes(`Listening on port ${goPort}.`)
          ? `http://127.0.0.1:${goPort}`
          : /Server listening at (http:\/\/127\.0\.0\.1:\d+)/u.exec(line)?.[1];
      if (address !== undefined) {
        waiter?.resolve(address);
        waiter = undefined;
      }
    }
  }
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("error", (error) => {
    waiter?.reject(error);
  });
  child.once("exit", (code, signal) => {
    waiter?.reject(
      new Error(`Compiled server exited (${code ?? signal}).\n${output}`),
    );
  });
  return {
    child,
    ready: ready.promise,
    output: () => output,
    async nextReady(): Promise<string> {
      if (waiter !== undefined) {
        throw new Error("A process readiness waiter is already registered.");
      }
      waiter = Promise.withResolvers<string>();
      return await waiter.promise;
    },
  };
}

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Missing ephemeral listener.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  return address.port;
}

function summary(values: readonly number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    p50Milliseconds: sorted[Math.floor(sorted.length * 0.5)],
    p95Milliseconds: sorted[Math.floor(sorted.length * 0.95)],
    maxMilliseconds: sorted.at(-1),
  };
}

async function settleLanes(tasks: ReadonlyArray<Promise<void>>) {
  const results = await Promise.allSettled(tasks);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Evaluation lanes failed.");
  }
}

/* eslint-disable no-await-in-loop -- Each lane must follow the actual client protocol in order. */
async function buildRust(directory: string) {
  const crate = path.join(ROOT, "experimental/rust-server");
  await run("cargo", ["build", "--release", "--locked"], {
    cwd: crate,
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  await cp(
    path.join(crate, "target/release/hanabi-rust-poc"),
    path.join(directory, "hanabi-rust-poc"),
  );
}

async function buildGo(directory: string) {
  for (const relative of [
    "packages/game/src/json",
    "packages/server/src/json",
    "server/src/views",
  ]) {
    await mkdir(path.dirname(path.join(directory, relative)), {
      recursive: true,
    });
    await symlink(
      path.join(ROOT, relative),
      path.join(directory, relative),
      "dir",
    );
  }
  await run("go", ["build", "-o", path.join(directory, "hanabi-live"), "."], {
    cwd: path.join(ROOT, "server/src"),
    timeout: 120_000,
  });
}

databaseDescribe("normal-server comparison", () => {
  test.each(["go", "typescript", "rust"] as const)(
    "%s executes matched gameplay, live reconnects, and cold historical replays",
    async (language) => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      await mkdir(path.join(ROOT, "dist"), { recursive: true });
      const directory = await mkdtemp(
        path.join(ROOT, "dist/normal-comparison-"),
      );
      let processState: ReturnType<typeof startProcess> | undefined;
      let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
      const sockets = new Set<WebSocket>();
      const samples = {
        action: [] as number[],
        liveReconnect: [] as number[],
        replay: [] as number[],
        reconnect: [] as number[],
        replayHistoryReady: [] as number[],
        reconnectHistoryReady: [] as number[],
      };
      let peakRSSKiB = 0;
      const completed: Array<{
        databaseID: number;
        aliceCookie: string;
        bobCookie: string;
      }> = [];
      try {
        await sql.unsafe(
          await readFile(
            path.join(ROOT, "install/database_schema.sql"),
            "utf8",
          ),
        );
        const version = expectedSchemaVersion(
          await readdir(path.join(ROOT, "install/migrations")),
        );
        await sql`CREATE TABLE public.schema_version (version integer PRIMARY KEY)`;
        await sql`INSERT INTO public.schema_version (version) VALUES (${version})`;
        await run("bash", [path.join(ROOT, "packages/server/build.sh")], {
          cwd: ROOT,
          timeout: 30_000,
        });
        await prepareRoot(directory, database, "localhost");
        if (language === "rust") {
          redis = await redisFixture();
          await appendFile(
            path.join(directory, ".env"),
            `REDIS_URL=${redis.url}\n`,
          );
          await buildRust(directory);
        }
        let goPort: number | undefined;
        if (language === "go") {
          goPort = await unusedPort();
          const operationsPort = await unusedPort();
          await appendFile(
            path.join(directory, ".env"),
            `PORT=${goPort}\nLOCALHOST_PORT=${operationsPort}\n`,
          );
          await buildGo(directory);
        }
        processState = startProcess(directory, goPort, language === "rust");
        let address = await bounded(
          processState.ready,
          `${language} readiness`,
        );
        // Go announces its port immediately before calling ListenAndServe.
        await delay(50);
        const page = await fetch(address, {
          signal: AbortSignal.timeout(5000),
        });
        expect(page.status).toBe(200);
        await page.text();
        async function sample() {
          if (processState?.child.pid === undefined) {
            return;
          }
          const status = await readFile(
            `/proc/${processState.child.pid}/status`,
            "utf8",
          );
          peakRSSKiB = Math.max(
            peakRSSKiB,
            Number(/VmHWM:\s+(\d+)/u.exec(status)?.[1] ?? 0),
          );
        }

        async function connect(cookie: string) {
          const peer = socketClient(address, cookie);
          sockets.add(peer.socket);
          await peer.receive("welcome", SERVER_COMMAND_SCHEMAS.welcome);
          return peer;
        }

        async function close(peer: ReturnType<typeof socketClient>) {
          const closed = once(peer.socket, "close");
          peer.socket.close();
          await bounded(closed, "evaluation client close");
          sockets.delete(peer.socket);
        }

        async function unattend(
          peer: ReturnType<typeof socketClient>,
          tableID: number,
        ) {
          peer.send("tableUnattend", { tableID });
          // Unattend has no direct acknowledgement; use an ordinary ordered command.
          peer.send("getName", {});
          await peer.receive("name", SERVER_COMMAND_SCHEMAS.name);
        }

        async function bootstrap(
          peer: ReturnType<typeof socketClient>,
          tableID: number,
        ) {
          peer.send("getGameInfo1", { tableID });
          const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
          peer.send("getGameInfo2", { tableID });
          const history = await peer.receive(
            "gameActionList",
            SERVER_COMMAND_SCHEMAS.gameActionList,
          );
          if (!init.replay) {
            peer.send("loaded", { tableID });
          }
          return { init, history };
        }
        const desired = winningDeck();
        const input = [...desired];
        const rng = new GoRandom(seedToInt64("p2v0s1"));
        const swaps = input.map((_, index) => rng.intn(index + 1));
        for (let index = input.length - 1; index >= 0; index--) {
          const other = swaps[index];
          const first = input[index];
          assertDefined(other, "Missing inverse shuffle index.");
          const second = input[other];
          assertDefined(first, "Missing inverse shuffle card.");
          assertDefined(second, "Missing inverse shuffle partner.");
          input[index] = second;
          input[other] = first;
        }
        const gameplayStart = performance.now();
        await settleLanes(
          Array.from({ length: 4 }, async (_, lane) => {
            for (let game = 0; game < 2; game++) {
              const aliceCookie = await login(
                address,
                `Bench${lane}${game}Alice`,
              );
              const bobCookie = await login(address, `Bench${lane}${game}Bob`);
              let alice = await connect(aliceCookie);
              const bob = await connect(bobCookie);
              alice.send("tableCreate", {
                name: "Comparison",
                gameJSON: { players: ["Preset1", "Preset2"], deck: input },
              });
              const { tableID } = await alice.receive(
                "joined",
                SERVER_COMMAND_SCHEMAS.joined,
              );
              bob.send("tableJoin", { tableID });
              await bob.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
              alice.send("tableStart", { tableID });
              await alice.receive(
                "tableStart",
                SERVER_COMMAND_SCHEMAS.tableStart,
              );
              await bob.receive(
                "tableStart",
                SERVER_COMMAND_SCHEMAS.tableStart,
              );
              const [a, b] = await Promise.all([
                bootstrap(alice, tableID),
                bootstrap(bob, tableID),
              ]);
              expect(
                [a.init.ourPlayerIndex, b.init.ourPlayerIndex].toSorted(
                  (left, right) => left - right,
                ),
              ).toEqual([0, 1]);
              for (let turn = 0; turn < 25; turn++) {
                const peer = turn % 2 === a.init.ourPlayerIndex ? alice : bob;
                const order = desired.findIndex(
                  (card) =>
                    card.suitIndex === Math.floor(turn / 5)
                    && card.rank === (turn % 5) + 1,
                );
                const start = performance.now();
                peer.send("action", {
                  tableID,
                  type: 0,
                  target: order,
                  requestID: `play-${turn}`,
                });
                await peer.receive(
                  "gameAction",
                  SERVER_COMMAND_SCHEMAS.gameAction,
                  (event) =>
                    event.action.type === "play"
                    && event.action.order === order,
                );
                samples.action.push(performance.now() - start);
                if (turn === 4) {
                  const reconnectStart = performance.now();
                  await close(alice);
                  alice = await connect(aliceCookie);
                  alice.send("tableReattend", { tableID });
                  await alice.receive(
                    "tableStart",
                    SERVER_COMMAND_SCHEMAS.tableStart,
                  );
                  const restored = await bootstrap(alice, tableID);
                  expect(restored.init.ourPlayerIndex).toBe(
                    a.init.ourPlayerIndex,
                  );
                  expect(
                    restored.history.list.filter(
                      (event) => event.type === "play",
                    ),
                  ).toHaveLength(5);
                  expect(
                    restored.history.list.some(
                      (event) =>
                        event.type === "draw"
                        && event.playerIndex === a.init.ourPlayerIndex
                        && event.rank === -1,
                    ),
                  ).toBe(true);
                  samples.liveReconnect.push(
                    performance.now() - reconnectStart,
                  );
                }
              }
              await alice.receive("gameHistory", wireHistorySchema, (games) =>
                games.some((entry) => entry.score === 25),
              );
              const finished = await bootstrap(alice, tableID);
              expect(finished.init.replay).toBe(true);
              expect(finished.history.list).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({ type: "status", score: 25 }),
                ]),
              );
              completed.push({
                databaseID: finished.init.databaseID,
                aliceCookie,
                bobCookie,
              });
              for (const peer of [alice, bob]) {
                await unattend(peer, tableID);
                await close(peer);
              }
            }
          }),
        );
        const gameplayMilliseconds = performance.now() - gameplayStart;
        expect(await sql`SELECT score FROM games`).toEqual(
          Array.from({ length: 8 }, () => ({ score: 25 })),
        );
        expect(
          await sql`SELECT count(*)::int AS count FROM game_actions`,
        ).toEqual([{ count: 200 }]);
        expect(
          await sql`SELECT count(*)::int AS count FROM game_participants`,
        ).toEqual([{ count: 16 }]);
        expect(
          await sql`SELECT count(*)::int AS count FROM game_custom_decks`,
        ).toEqual([{ count: 8 }]);
        expect(
          await sql`SELECT count(*)::int AS count FROM active_games`,
        ).toEqual([{ count: 0 }]);
        const archives = await sql<
          Array<{ deck: Uint8Array; actions: unknown }>
        >`
          SELECT d.deck, (SELECT jsonb_agg(jsonb_build_object(
            'type',a.type,'target',a.target,'value',a.value) ORDER BY a.turn)
            FROM game_actions a WHERE a.game_id=g.id) AS actions
          FROM games g JOIN game_custom_decks d ON d.game_id=g.id
        `;
        for (const archive of archives) {
          const deck = decodeCustomDeck(archive.deck, getVariant("No Variant"));
          expect(deck).toEqual(desired);
          const checked = importReplay({
            players: ["Alice", "Bob"],
            deck,
            actions: archive.actions,
          });
          expect(checked.warnings).toEqual([]);
          expect(checked.state.score).toBe(25);
        }
        const statsDeadline = performance.now() + 5000;
        for (;;) {
          const [stats] = await sql<Array<{ users: number; games: number }>>`
            SELECT COALESCE((SELECT SUM(num_games) FROM user_stats WHERE variant_id=0),0)::int AS users,
              COALESCE((SELECT num_games FROM variant_stats WHERE variant_id=0),0)::int AS games
          `;
          if (stats?.users === 16 && stats.games === 8) {
            break;
          }
          if (performance.now() > statsDeadline) {
            throw new Error("Derived statistics did not settle.");
          }
          await delay(10);
        }
        await sample();
        await stopChild(processState.child);
        const [writes] = await sql<Array<{ count: number }>>`
          SELECT (n_tup_ins+n_tup_upd)::int AS count FROM pg_stat_user_tables WHERE relname='active_games'
        `;
        assertDefined(writes, "Missing checkpoint write statistics.");
        processState = startProcess(directory, goPort, language === "rust");
        address = await bounded(
          processState.ready,
          `${language} cold replay readiness`,
        );
        await delay(50);
        const readStart = performance.now();
        async function readReplay(
          peer: ReturnType<typeof socketClient>,
          databaseID: number,
        ) {
          peer.send("replayCreate", {
            source: "id",
            visibility: "solo",
            databaseID,
          });
          const { tableID } = await peer.receive(
            "tableStart",
            SERVER_COMMAND_SCHEMAS.tableStart,
          );
          const replay = await bootstrap(peer, tableID);
          expect(replay.init.databaseID).toBe(databaseID);
          expect(
            replay.history.list.filter((event) => event.type === "play"),
          ).toHaveLength(25);
          expect(replay.history.list).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: "status", score: 25 }),
            ]),
          );
          const historyReady = performance.now();
          await unattend(peer, tableID);
          return historyReady;
        }
        await settleLanes(
          completed.map(async (game) => {
            const peer = await connect(game.bobCookie);
            await settleLanes([
              (async () => {
                for (let index = 0; index < 20; index++) {
                  const start = performance.now();
                  const ready = await readReplay(peer, game.databaseID);
                  samples.replayHistoryReady.push(ready - start);
                  samples.replay.push(performance.now() - start);
                }
              })(),
              (async () => {
                for (let index = 0; index < 10; index++) {
                  const start = performance.now();
                  const returning = await connect(game.aliceCookie);
                  const ready = await readReplay(returning, game.databaseID);
                  samples.reconnectHistoryReady.push(ready - start);
                  await close(returning);
                  samples.reconnect.push(performance.now() - start);
                }
              })(),
            ]);
            await close(peer);
          }),
        );
        await sample();
        const deckSHA256 = createHash("sha256")
          .update(JSON.stringify(desired))
          .digest("hex");
        const latency = Object.fromEntries(
          Object.entries(samples).map(([name, values]) => [
            name,
            summary(values),
          ]),
        );
        console.info(
          "NORMAL_SERVER_EVALUATION",
          JSON.stringify({
            language,
            driverNode: process.version,
            scope:
              language === "rust"
                ? "Separate release-mode Rust server; same protocol workload, Redis AOF/WAITAOF state and disposable PostgreSQL history. Storage differs from Go/TypeScript; not a language-only or capacity comparison."
                : "Separate normal server process; real login/cookies/client wire protocol; disposable local PostgreSQL. Not a capacity or language-only benchmark.",
            deckSHA256,
            games: completed.length,
            lanes: 4,
            peakRSSKiB,
            postgresCheckpointWrites: writes.count,
            stateStore:
              language === "rust" ? "Redis AOF/WAITAOF" : "PostgreSQL",
            gameplayMilliseconds,
            mixedReadMilliseconds: performance.now() - readStart,
            latency,
          }),
        );
      } catch (error) {
        throw new Error(
          `${language} normal-server evaluation failed.\n${processState?.output() ?? ""}`,
          { cause: error },
        );
      } finally {
        for (const socket of sockets) {
          socket.terminate();
        }
        if (processState !== undefined) {
          await stopChild(processState.child);
        }
        await redis?.close();
        await sql.end({ timeout: 3 });
        await database.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    600_000,
  );
});

databaseDescribe("Rust actor durability and ownership", () => {
  test.each(["crash", "failed write"] as const)(
    "fences replaced sessions during persistence and recovers after %s",
    async (failure) => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      await mkdir(path.join(ROOT, "dist"), { recursive: true });
      const directory = await mkdtemp(path.join(ROOT, "dist/rust-recovery-"));
      let state: ReturnType<typeof startProcess> | undefined;
      let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
      const namespace = JSON.stringify([
        database.connection.host,
        database.connection.port,
        database.connection.database,
      ]);
      const sockets: WebSocket[] = [];
      try {
        await sql.unsafe(
          await readFile(
            path.join(ROOT, "install/database_schema.sql"),
            "utf8",
          ),
        );
        const version = expectedSchemaVersion(
          await readdir(path.join(ROOT, "install/migrations")),
        );
        await sql`CREATE TABLE public.schema_version (version integer PRIMARY KEY)`;
        await sql`INSERT INTO public.schema_version VALUES (${version})`;
        await run("bash", [path.join(ROOT, "packages/server/build.sh")], {
          cwd: ROOT,
          timeout: 30_000,
        });
        await prepareRoot(directory, database, "localhost");
        redis = await redisFixture();
        await appendFile(
          path.join(directory, ".env"),
          `REDIS_URL=${redis.url}\n`,
        );
        await buildRust(directory);
        state = startProcess(directory, undefined, true);
        let address = await bounded(state.ready, "Rust recovery readiness");
        const aliceCookie = await login(address, "RecoveryAlice");
        const bobCookie = await login(address, "RecoveryBob");
        async function connect(cookie: string) {
          const peer = socketClient(address, cookie);
          sockets.push(peer.socket);
          const frames: string[] = [];
          peer.socket.on("message", (raw: Buffer) => {
            frames.push(raw.toString());
          });
          await peer.receive("welcome", SERVER_COMMAND_SCHEMAS.welcome);
          return { ...peer, frames };
        }
        let alice = await connect(aliceCookie);
        let bob = await connect(bobCookie);
        alice.send("tableCreate", { name: "Recovery" });
        const { tableID } = await alice.receive(
          "joined",
          SERVER_COMMAND_SCHEMAS.joined,
        );
        bob.send("tableJoin", { tableID });
        await bob.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
        alice.send("tableStart", { tableID, requestID: "start" });
        await alice.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
        await bob.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
        async function bootstrap(peer: ReturnType<typeof socketClient>) {
          peer.send("getGameInfo1", { tableID });
          const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
          peer.send("getGameInfo2", { tableID });
          const history = await peer.receive(
            "gameActionList",
            SERVER_COMMAND_SCHEMAS.gameActionList,
          );
          peer.send("loaded", { tableID });
          return { init, history };
        }
        const [a, b] = await Promise.all([bootstrap(alice), bootstrap(bob)]);
        await alice.receive(
          "connected",
          SERVER_COMMAND_SCHEMAS.connected,
          (data) => data.list.every(Boolean),
        );
        await bob.receive(
          "connected",
          SERVER_COMMAND_SCHEMAS.connected,
          (data) => data.list.every(Boolean),
        );
        const activeIsAlice = a.init.ourPlayerIndex === 0;
        const active = activeIsAlice ? alice : bob;
        const other = activeIsAlice ? bob : alice;
        const initial = activeIsAlice ? a : b;
        const card = initial.history.list.find(
          (event) => event.type === "draw" && event.playerIndex === 0,
        );
        assertDefined(card, "Missing active player's initial hand.");
        if (card.type !== "draw") {
          throw new Error("Expected a draw.");
        }
        const startedState = await redis.states(namespace);
        expect(startedState.length).toBeGreaterThan(0);
        expect(await sql`SELECT game_id FROM active_games`).toHaveLength(0);
        const action = {
          tableID,
          type: 0,
          target: card.order,
          requestID: "accepted-once",
        };
        let replacement: Awaited<ReturnType<typeof connect>> | undefined;
        try {
          active.send("action", { ...action, target: 9999 });
          await active.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
          await redis.command("CLIENT", "PAUSE", "2000", "WRITE");
          active.send("action", action);
          const deadline = performance.now() + 1500;
          for (;;) {
            const clients = await redis.text("CLIENT", "LIST");
            if (
              clients
                .split("\n")
                .some(
                  (line) =>
                    line.includes("name=hanabi-state ")
                    && /flags=\S*b\S*/u.test(line),
                )
            ) {
              break;
            }
            if (performance.now() > deadline) {
              throw new Error("Rust action did not wait for its Redis write.");
            }
            await delay(10);
          }
          expect(
            active.frames.some((message) => message.startsWith("gameAction ")),
          ).toBe(false);
          replacement = await connect(activeIsAlice ? aliceCookie : bobCookie);
          await redis.command("CLIENT", "UNPAUSE");
          await other.receive(
            "gameAction",
            SERVER_COMMAND_SCHEMAS.gameAction,
            (event) =>
              event.action.type === "play" || event.action.type === "discard",
          );
          expect(
            active.frames.some((message) => message.startsWith("gameAction ")),
          ).toBe(false);
          expect(
            replacement.frames.some((message) =>
              message.startsWith("gameAction "),
            ),
          ).toBe(false);
        } finally {
          await redis.command("CLIENT", "UNPAUSE");
        }
        if (activeIsAlice) {
          alice = replacement;
        } else {
          bob = replacement;
        }
        replacement.send("tableReattend", { tableID });
        await replacement.receive(
          "tableStart",
          SERVER_COMMAND_SCHEMAS.tableStart,
        );
        await bootstrap(replacement);
        replacement.send("action", action);
        replacement.send("getGameInfo2", { tableID });
        const onceOnly = await replacement.receive(
          "gameActionList",
          SERVER_COMMAND_SCHEMAS.gameActionList,
        );
        expect(
          onceOnly.list.filter(
            (event) => event.type === "play" || event.type === "discard",
          ),
        ).toHaveLength(1);
        const acknowledged = await redis.states(namespace);
        if (failure === "failed write") {
          const next = activeIsAlice ? bob : alice;
          const nextInitial = activeIsAlice ? b : a;
          const nextCard = nextInitial.history.list.find(
            (event) => event.type === "draw" && event.playerIndex === 1,
          );
          assertDefined(nextCard, "Missing next player's hand.");
          if (nextCard.type !== "draw") {
            throw new Error("Expected a draw.");
          }
          const offset = replacement.frames.length;
          const stopped = once(state.child, "close");
          await redis.command("CONFIG", "SET", "maxmemory", "1");
          next.send("action", {
            tableID,
            type: 0,
            target: nextCard.order,
            requestID: "not-committed",
          });
          await bounded(stopped, "Rust fail-closed Redis shutdown", 15_000);
          expect(state.child.exitCode).not.toBe(0);
          expect(
            replacement.frames
              .slice(offset)
              .some((message) => message.startsWith("gameAction ")),
          ).toBe(false);
          await redis.restart();
        } else {
          const closed = once(state.child, "close");
          state.child.kill("SIGKILL");
          await bounded(closed, "Rust crash");
        }
        expect(await redis.states(namespace)).toEqual(acknowledged);
        state = startProcess(directory, undefined, true);
        address = await bounded(state.ready, "Rust cold recovery readiness");
        const returning = await connect(
          activeIsAlice ? aliceCookie : bobCookie,
        );
        returning.send("tableReattend", { tableID });
        await returning.receive(
          "tableStart",
          SERVER_COMMAND_SCHEMAS.tableStart,
        );
        const restored = await bootstrap(returning);
        expect(restored.init.ourPlayerIndex).toBe(0);
        expect(
          restored.history.list.filter(
            (event) => event.type === "play" || event.type === "discard",
          ),
        ).toHaveLength(1);
        expect(
          restored.history.list.some(
            (event) =>
              event.type === "draw"
              && event.playerIndex === 0
              && event.rank === -1,
          ),
        ).toBe(true);
        returning.send("action", action);
        returning.send("getGameInfo2", { tableID });
        const duplicate = await returning.receive(
          "gameActionList",
          SERVER_COMMAND_SCHEMAS.gameActionList,
        );
        expect(
          duplicate.list.filter(
            (event) => event.type === "play" || event.type === "discard",
          ),
        ).toHaveLength(1);
      } catch (error) {
        throw new Error(
          `Rust actor acceptance failed.\n${state?.output() ?? ""}`,
          { cause: error },
        );
      } finally {
        for (const socket of sockets) {
          socket.terminate();
        }
        if (state !== undefined) {
          await stopChild(state.child);
        }
        await redis?.close();
        await sql.end({ timeout: 3 });
        await database.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
databaseDescribe("temporary Go-to-Rust cutover", () => {
  test("drains Go and resumes its actual game, cookies, receipts and private notes in Rust", async () => {
    const database = await evaluationDatabase();
    let sql = database.connect();
    await mkdir(path.join(ROOT, "dist"), { recursive: true });
    const directory = await mkdtemp(path.join(ROOT, "dist/go-rust-cutover-"));
    let processState: ReturnType<typeof startProcess> | undefined;
    let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
    const sockets: WebSocket[] = [];
    try {
      await sql.unsafe(
        await readFile(path.join(ROOT, "install/database_schema.sql"), "utf8"),
      );
      await sql`CREATE TABLE schema_version(version integer PRIMARY KEY)`;
      await sql`INSERT INTO schema_version VALUES(${expectedSchemaVersion(await readdir(path.join(ROOT, "install/migrations")))})`;
      await run("bash", [path.join(ROOT, "packages/server/build.sh")], {
        cwd: ROOT,
        timeout: 30_000,
      });
      await prepareRoot(directory, database, "localhost");
      redis = await redisFixture();
      const port = await unusedPort();
      let controlPort = await unusedPort();
      while (controlPort === port) {
        controlPort = await unusedPort();
      }
      await appendFile(
        path.join(directory, ".env"),
        `PORT=${port}\nLOCALHOST_PORT=${controlPort}\nREDIS_URL=${redis.url}\n`,
      );
      await Promise.all([buildGo(directory), buildRust(directory)]);
      processState = startProcess(directory, port);
      let address = await bounded(processState.ready, "Go cutover readiness");
      // Go logs its address immediately before binding the listener.
      await delay(50);
      const cookies = [
        await login(address, "CutoverAlice"),
        await login(address, "CutoverBob"),
      ];
      async function connect(cookie: string) {
        const peer = socketClient(address, cookie);
        sockets.push(peer.socket);
        const welcome = await peer.receive(
          "welcome",
          SERVER_COMMAND_SCHEMAS.welcome,
        );
        return { ...peer, welcome };
      }
      const peers = await Promise.all(cookies.map(connect));
      const owner = peers[0];
      assertDefined(owner, "Missing Go owner.");
      owner.send("tableCreate", {
        name: "Cutover",
        options: {
          variantName: "No Variant",
          timed: true,
          timeBase: 600,
          timePerTurn: 2,
        },
      });
      const { tableID } = await owner.receive(
        "joined",
        SERVER_COMMAND_SCHEMAS.joined,
      );
      const partner = peers[1];
      assertDefined(partner, "Missing Go partner.");
      partner.send("tableJoin", { tableID });
      await partner.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
      owner.send("tableStart", { tableID, requestID: "go-start" });
      async function bootstrap(peer: ReturnType<typeof socketClient>) {
        peer.send("getGameInfo1", { tableID });
        const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
        peer.send("getGameInfo2", { tableID });
        const history = await peer.receive(
          "gameActionList",
          SERVER_COMMAND_SCHEMAS.gameActionList,
        );
        peer.send("loaded", { tableID });
        return { init, history };
      }
      const original = await Promise.all(
        peers.map(async (peer) => {
          await peer.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
          return await bootstrap(peer);
        }),
      );
      const activeIndex = original.findIndex(
        (game) => game.init.ourPlayerIndex === 0,
      );
      const active = peers[activeIndex];
      const activeGame = original[activeIndex];
      assertDefined(active, "Missing active Go player.");
      assertDefined(activeGame, "Missing active Go hand.");
      const card = activeGame.history.list.find(
        (event) => event.type === "draw" && event.playerIndex === 0,
      );
      assertDefined(card, "Missing Go draw.");
      if (card.type !== "draw") {
        throw new Error("Expected Go draw.");
      }
      const action = {
        tableID,
        type: 0,
        target: card.order,
        requestID: "go-accepted",
      };
      active.send("action", action);
      await active.receive("gameAction", SERVER_COMMAND_SCHEMAS.gameAction);
      owner.send("note", {
        tableID,
        order: 0,
        note: "retained across cutover",
        requestID: "go-note",
      });
      owner.send("chat", {
        room: `table${tableID}`,
        msg: "Go cutover chat",
        requestID: "go-chat",
      });
      owner.send("getGameInfo2", { tableID });
      await owner.receive(
        "gameActionList",
        SERVER_COMMAND_SCHEMAS.gameActionList,
      );
      const stopped = once(processState.child, "close");
      const response = await fetch(
        `http://127.0.0.1:${controlPort}/rustCutover`,
        { method: "POST" },
      );
      expect(response.status).toBe(200);
      await response.text();
      await bounded(stopped, "Go durable cutover stop");
      expect(processState.child.exitCode).toBe(0);
      expect(
        await readFile(path.join(directory, ".go-to-rust-cutover"), "utf8"),
      ).toContain("Prepared");
      processState = startProcess(directory, port);
      await expect(
        bounded(processState.ready, "Go restart fence"),
      ).rejects.toThrow("Go-to-Rust cutover");
      const [source] = await sql<
        Array<{ game_id: number }>
      >`SELECT game_id FROM active_games`;
      assertDefined(source, "Missing saved Go source.");
      await sql.end({ timeout: 3 });
      const migrated = await run(
        path.join(directory, "hanabi-rust-poc"),
        ["--import-go-checkpoints"],
        {
          cwd: directory,
          env: { PATH: process.env["PATH"], HOME: directory },
          timeout: 30_000,
        },
      );
      expect(migrated.stdout).toContain("Imported 1 Go checkpoints");
      sql = database.connect();
      expect(await sql`SELECT game_id FROM active_games`).toHaveLength(0);
      processState = startProcess(directory, undefined, true);
      address = await bounded(processState.ready, "Rust cutover readiness");
      const returning = await Promise.all(cookies.map(connect));
      const restored = await Promise.all(
        returning.map(async (peer) => {
          expect(peer.welcome.playingAtTables).toEqual([tableID]);
          peer.send("tableReattend", { tableID });
          await peer.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
          return await bootstrap(peer);
        }),
      );
      expect(restored.map((game) => game.init.ourPlayerIndex)).toEqual(
        original.map((game) => game.init.ourPlayerIndex),
      );
      const migratedPlayer = returning[activeIndex];
      assertDefined(migratedPlayer, "Missing migrated actor.");
      migratedPlayer.send("action", action);
      migratedPlayer.send("getGameInfo2", { tableID });
      const unchanged = await migratedPlayer.receive(
        "gameActionList",
        SERVER_COMMAND_SCHEMAS.gameActionList,
      );
      expect(
        unchanged.list.filter(
          (event) => event.type === "play" || event.type === "discard",
        ),
      ).toHaveLength(1);
      expect(
        unchanged.list.some(
          (event) =>
            event.type === "draw"
            && event.playerIndex === 0
            && event.rank === -1,
        ),
      ).toBe(true);
      const nextIndex = restored.findIndex(
        (game) => game.init.ourPlayerIndex === 1,
      );
      const next = returning[nextIndex];
      const nextGame = restored[nextIndex];
      assertDefined(next, "Missing next Rust player.");
      assertDefined(nextGame, "Missing next Rust hand.");
      const nextCard = nextGame.history.list.find(
        (event) => event.type === "draw" && event.playerIndex === 1,
      );
      assertDefined(nextCard, "Missing resumed card.");
      if (nextCard.type !== "draw") {
        throw new Error("Expected resumed draw.");
      }
      next.send("action", {
        tableID,
        type: 0,
        target: nextCard.order,
        requestID: "rust-action",
      });
      await next.receive("gameAction", SERVER_COMMAND_SCHEMAS.gameAction);
      const leader = returning[0];
      assertDefined(leader, "Missing migrated owner.");
      leader.send("tableTerminate", { tableID });
      const finished = await leader.receive(
        "finishOngoingGame",
        SERVER_COMMAND_SCHEMAS.finishOngoingGame,
      );
      expect(finished.databaseID).toBe(source.game_id);
      const exported = await fetch(`${address}/export/${finished.databaseID}`);
      expect(exported.status).toBe(200);
      const archive = importReplay(await exported.json());
      expect(archive.notes.flat()).toContain("retained across cutover");
      expect(await sql`SELECT id FROM games`).toEqual([{ id: source.game_id }]);
      expect(
        await sql`SELECT id FROM chat_log WHERE message='Go cutover chat'`,
      ).toHaveLength(1);
    } catch (error) {
      throw new Error(
        `Go-to-Rust cutover failed.\n${processState?.output() ?? ""}`,
        { cause: error },
      );
    } finally {
      for (const socket of sockets) {
        socket.terminate();
      }
      if (processState !== undefined) {
        await stopChild(processState.child);
      }
      await redis?.close();
      await sql.end({ timeout: 3 });
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 600_000);
});

/* eslint-enable no-await-in-loop */
async function login(address: string, username: string) {
  const response = await fetch(`${address}/login`, {
    method: "POST",
    body: new URLSearchParams({
      username,
      password: "synthetic-smoke-password",
      version: "1",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  expect({ status: response.status, body }).toEqual({
    status: 200,
    body: "OK\n",
  });
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("hanabi.sid="))
    ?.split(";", 1)[0];
  assertDefined(cookie, "Login did not return a session cookie.");
  expect(
    decodeSessionCookie(
      cookie.slice("hanabi.sid=".length),
      "synthetic-process-smoke-secret-".repeat(8),
    ),
  ).toBeGreaterThan(0);
  return cookie;
}

function socketClient(address: string, cookie: string) {
  const socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`, {
    headers: { Cookie: cookie },
    handshakeTimeout: 5000,
  });
  const messages: string[] = [];
  let changed = Promise.withResolvers<undefined>();
  let failure: Error | undefined;
  function wake() {
    const previous = changed;
    changed = Promise.withResolvers<undefined>();
    previous.resolve(undefined);
  }
  socket.on("message", (raw) => {
    if (Buffer.isBuffer(raw)) {
      messages.push(raw.toString());
    } else {
      failure = new Error("Expected a text WebSocket frame.");
    }
    wake();
  });
  socket.on("error", (error) => {
    failure = error;
    wake();
  });
  socket.on("close", () => {
    failure ??= new Error("WebSocket closed before expected message.");
    wake();
  });

  async function receive<T>(
    command: string,
    schema: z.ZodType<T>,
    accept: (data: T) => boolean = () => true,
  ): Promise<T> {
    return await bounded(
      (async () => {
        for (;;) {
          const index = messages.findIndex((message) =>
            message.startsWith(`${command} `),
          );
          if (index !== -1) {
            const [message] = messages.splice(index, 1);
            assertDefined(message, "Missing queued WebSocket message.");
            const data: unknown = JSON.parse(message.slice(command.length + 1));
            const parsed = schema.parse(data);
            if (accept(parsed)) {
              return parsed;
            }
            continue;
          }
          if (failure !== undefined) {
            throw failure;
          }
          const rejection = messages.find((message) =>
            /^(?:error|warning) /u.test(message),
          );
          if (rejection !== undefined) {
            throw new Error(`Unexpected server rejection: ${rejection}`);
          }
          // eslint-disable-next-line no-await-in-loop
          await changed.promise;
        }
      })(),
      `WebSocket ${command}`,
    );
  }
  return {
    socket,
    receive,
    send(command: string, data: object) {
      socket.send(`${command} ${JSON.stringify(data)}`);
    },
  };
}

databaseDescribe.each(["typescript", "rust"] as const)(
  "compiled application entry point (%s)",
  (language) => {
    test.each([
      [
        "completes real WebSocket gameplay on localhost",
        "localhost",
        undefined,
      ],
      [
        "completes real WebSocket gameplay on 127.0.0.1",
        "127.0.0.1",
        undefined,
      ],
      [
        "restores acknowledged gameplay and reserved ID after abrupt process death",
        "127.0.0.1",
        "SIGKILL",
      ],
      [
        "drains and preserves timed gameplay on SIGTERM",
        "127.0.0.1",
        "SIGTERM",
      ],
      ["drains and preserves timed gameplay on SIGINT", "127.0.0.1", "SIGINT"],
      [
        "replaces the process through gracefulRestart without losing gameplay",
        "127.0.0.1",
        "HTTP",
      ],
    ] as const)(
      "%s",
      async (_title, domain, signal) => {
        const restart = signal !== undefined;
        const crash = signal === "SIGKILL";
        await run("bash", [path.join(ROOT, "packages/server/build.sh")], {
          cwd: ROOT,
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const database = await evaluationDatabase();
        const client = database.connect();
        let directory: string | undefined;
        let processState: ReturnType<typeof startProcess> | undefined;
        let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
        let outputBeforeCrash = "";
        const sockets: WebSocket[] = [];
        async function checkpointProgress(): Promise<
          readonly CheckpointProgress[]
        > {
          if (redis === undefined) {
            return await client<CheckpointProgress[]>`
            SELECT game_id, revision::integer AS revision,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'turn')::integer AS turn,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'activePlayerIndex')::integer AS active_player_index,
              checkpoint::jsonb -> 'game' -> 'clocks' AS clocks
            FROM active_games
          `;
          }
          const namespace = JSON.stringify([
            database.connection.host,
            database.connection.port,
            database.connection.database,
          ]);
          const stored = await redis.states(namespace);
          return stored.flatMap((record) => {
            if (record.revision === 0) {
              return [];
            }
            const table = rustProgressTableSchema.parse(record.payload);
            if (table.phase.phase !== "live") {
              return [];
            }
            const { snapshot } = table.phase;
            return [
              {
                game_id: snapshot.game_id,
                revision: record.revision,
                turn: snapshot.game.turn,
                active_player_index: snapshot.game.activePlayerIndex,
                clocks: snapshot.clocks,
              },
            ];
          });
        }
        try {
          await mkdir(path.join(ROOT, "dist"), { recursive: true });
          directory = await mkdtemp(path.join(ROOT, "dist/server-process-"));
          const schema = await readFile(
            path.join(ROOT, "install/database_schema.sql"),
            "utf8",
          );
          await client.unsafe(schema);
          const version = expectedSchemaVersion(
            await readdir(path.join(ROOT, "install/migrations")),
          );
          await client`CREATE TABLE public.schema_version (version integer PRIMARY KEY)`;
          await client`INSERT INTO public.schema_version (version) VALUES (${version})`;
          await prepareRoot(directory, database, domain);
          if (language === "rust") {
            redis = await redisFixture();
            await appendFile(
              path.join(directory, ".env"),
              `REDIS_URL=${redis.url}\n`,
            );
            await buildRust(directory);
          }
          processState = startProcess(
            directory,
            undefined,
            language === "rust",
          );
          let address = await bounded(
            processState.ready,
            "compiled server readiness",
          );
          const port = Number(new URL(address).port);
          expect(port).toBeGreaterThan(0);
          expect(port).not.toBe(80);
          expect(port).not.toBe(443);
          const page = await fetch(address, {
            signal: AbortSignal.timeout(5000),
          });
          expect(page.status).toBe(200);
          expect(await page.text()).toContain("page-wrapper");
          const operationsAddress =
            /Localhost operations listening at (http:\/\/127\.0\.0\.1:\d+)/u.exec(
              processState.output(),
            )?.[1];
          assertDefined(
            operationsAddress,
            "Missing loopback operations listener.",
          );
          const publicMetrics = await fetch(`${address}/metrics`);
          expect(publicMetrics.status).toBe(404);
          await publicMetrics.text();
          const metrics = await fetch(`${operationsAddress}/metrics`);
          expect(metrics.status).toBe(200);
          const poolSchema = z.object({
            maxConnections: z.number().int().positive(),
            totalConnections: z.number().int().positive(),
          });
          const reports = z
            .object({
              database: poolSchema,
              recovery: z.object({
                storageInitialized: z.literal(true),
                database: poolSchema,
              }),
            })
            .parse(await metrics.json());
          expect(reports.database.maxConnections).toBe(10);
          expect(reports.database.totalConnections).toBeLessThanOrEqual(10);
          expect(reports.recovery.database.maxConnections).toBe(2);
          expect(
            reports.recovery.database.totalConnections,
          ).toBeLessThanOrEqual(2);
          const aliceCookie = await login(address, "SmokeAlice");
          const alice = socketClient(address, aliceCookie);
          sockets.push(alice.socket);
          const aliceWelcome = await alice.receive(
            "welcome",
            SERVER_COMMAND_SCHEMAS.welcome,
          );
          expect(aliceWelcome.username).toBe("SmokeAlice");
          const bobCookie = await login(address, "SmokeBob");
          let bob = socketClient(address, bobCookie);
          sockets.push(bob.socket);
          const bobWelcome = await bob.receive(
            "welcome",
            SERVER_COMMAND_SCHEMAS.welcome,
          );
          expect(bobWelcome.username).toBe("SmokeBob");
          const maintenance = await fetch(`${operationsAddress}/maintenance`);
          expect(maintenance.status).toBe(200);
          await maintenance.text();
          await alice.receive(
            "maintenance",
            SERVER_COMMAND_SCHEMAS.maintenance,
            (data) => data.maintenanceMode,
          );
          alice.send("tableCreate", { name: "Blocked during maintenance" });
          const warning = await alice.receive(
            "warning",
            SERVER_COMMAND_SCHEMAS.warning,
          );
          expect(warning.warning).toContain("maintenance");
          const resumedCreation = await fetch(
            `${operationsAddress}/unmaintenance`,
          );
          expect(resumedCreation.status).toBe(200);
          await resumedCreation.text();
          await alice.receive(
            "maintenance",
            SERVER_COMMAND_SCHEMAS.maintenance,
            (data) => !data.maintenanceMode,
          );
          alice.send("tableCreate", {
            name: "Compiled smoke table",
            password: "synthetic-table-password",
            options: {
              variantName: "No Variant",
              timed: restart,
              timeBase: 600,
              timePerTurn: 2,
            },
          });
          const { tableID } = await alice.receive(
            "joined",
            SERVER_COMMAND_SCHEMAS.joined,
          );
          bob.send("tableJoin", {
            tableID,
            password: "synthetic-table-password",
          });
          const bobJoined = await bob.receive(
            "joined",
            SERVER_COMMAND_SCHEMAS.joined,
          );
          expect(bobJoined.tableID).toBe(tableID);
          const game = await bob.receive("game", SERVER_COMMAND_SCHEMAS.game);
          expect(game.players.map((player) => player.name)).toEqual([
            "SmokeAlice",
            "SmokeBob",
          ]);
          expect(game.players.map((player) => player.you)).toEqual([
            false,
            true,
          ]);
          bob.send("tableLeave", { tableID });
          const bobLeft = await bob.receive(
            "left",
            SERVER_COMMAND_SCHEMAS.left,
          );
          expect(bobLeft.tableID).toBe(tableID);
          const automatic = signal === undefined && domain !== "localhost";
          if (automatic) {
            alice.send("chat", { room: `table${tableID}`, msg: "/s2" });
            await alice.receive("chat", SERVER_COMMAND_SCHEMAS.chat, (data) =>
              data.msg.includes("as soon as 2 players have joined"),
            );
          }
          bob.send("tableJoin", {
            tableID,
            password: "synthetic-table-password",
          });
          await bob.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
          if (signal === undefined && !automatic) {
            alice.send("chat", {
              room: `table${tableID}`,
              msg: "/startin 0.001",
            });
          } else if (!automatic) {
            alice.send("tableStart", { tableID, requestID: "start-once" });
          }
          await alice.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
          await bob.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);

          async function bootstrap(peer: ReturnType<typeof socketClient>) {
            peer.send("getGameInfo1", { tableID });
            const init = await peer.receive(
              "init",
              SERVER_COMMAND_SCHEMAS.init,
            );
            peer.send("getGameInfo2", { tableID });
            const history = await peer.receive(
              "gameActionList",
              SERVER_COMMAND_SCHEMAS.gameActionList,
            );
            peer.send("loaded", { tableID });
            await peer.receive(
              "connected",
              SERVER_COMMAND_SCHEMAS.connected,
              (data) => data.list.every(Boolean),
            );
            return { init, history };
          }
          const [aliceGame, bobGame] = await Promise.all([
            bootstrap(alice),
            bootstrap(bob),
          ]);
          const operatorWarning = await fetch(
            `${operationsAddress}/sendWarning`,
            {
              method: "POST",
              body: new URLSearchParams({
                username: "SmokeAlice",
                msg: "Operator notice.",
              }),
            },
          );
          expect(operatorWarning.status).toBe(200);
          await operatorWarning.text();
          await alice.receive(
            "warning",
            SERVER_COMMAND_SCHEMAS.warning,
            (data) => data.warning === "Operator notice.",
          );
          const scheduled = await fetch(`${operationsAddress}/shutdown`);
          expect(scheduled.status).toBe(200);
          await scheduled.text();
          await alice.receive(
            "shutdown",
            SERVER_COMMAND_SCHEMAS.shutdown,
            (data) => data.shuttingDown,
          );
          const canceled = await fetch(`${operationsAddress}/cancel`);
          expect(canceled.status).toBe(200);
          await canceled.text();
          await alice.receive(
            "shutdown",
            SERVER_COMMAND_SCHEMAS.shutdown,
            (data) => !data.shuttingDown,
          );
          const active = aliceGame.init.ourPlayerIndex === 0 ? alice : bob;
          const activeGame =
            aliceGame.init.ourPlayerIndex === 0 ? aliceGame : bobGame;
          const card = activeGame.history.list.find(
            (event) => event.type === "draw" && event.playerIndex === 0,
          );
          assertDefined(card, "Missing first player's initial draw.");
          if (card.type !== "draw") {
            throw new Error("Expected an initial draw.");
          }
          expect(card.rank).toBe(-1);
          active.send("action", {
            tableID,
            type: 0,
            target: card.order,
            requestID: "play-once",
          });
          await active.receive("gameAction", SERVER_COMMAND_SCHEMAS.gameAction);
          active.send("getGameInfo2", { tableID });
          const acknowledged = await active.receive(
            "gameActionList",
            SERVER_COMMAND_SCHEMAS.gameActionList,
          );
          const checkpoints = await checkpointProgress();
          expect(checkpoints).toHaveLength(1);
          const checkpoint = checkpoints[0];
          assertDefined(checkpoint, "Missing acknowledged durable checkpoint.");
          expect(checkpoint.game_id).toBeGreaterThan(0);
          expect(checkpoint.turn).toBe(1);

          if (signal !== undefined) {
            outputBeforeCrash = processState.output();
            if (signal === "HTTP") {
              const ready = processState.nextReady();
              const response = await fetch(
                `${operationsAddress}/gracefulRestart`,
              );
              expect(response.status).toBe(200);
              await response.text();
              address = await bounded(ready, "replacement process readiness");
            } else {
              const crashed = processState.child;
              const crashedClosed = once(crashed, "close");
              expect(crashed.kill(signal)).toBe(true);
              await bounded(crashedClosed, "child process shutdown", 5000);
              if (crash) {
                expect(crashed.signalCode).toBe("SIGKILL");
              } else {
                expect(crashed.exitCode).toBe(0);
                expect(crashed.signalCode).toBeNull();
                expect(processState.output()).toContain(
                  "successfully shut down",
                );
              }
              processState = startProcess(
                directory,
                undefined,
                language === "rust",
              );
              address = await bounded(
                processState.ready,
                "restarted compiled server readiness",
              );
            }
            const retained = await checkpointProgress();
            if (crash) {
              expect(retained).toEqual(checkpoints);
            } else {
              expect(retained).toHaveLength(1);
              const saved = retained[0];
              assertDefined(saved, "Missing planned shutdown checkpoint.");
              expect(saved).toMatchObject({
                game_id: checkpoint.game_id,
                turn: checkpoint.turn,
                active_player_index: checkpoint.active_player_index,
              });
              expect(saved.revision).toBeGreaterThan(checkpoint.revision);
            }
            bob = socketClient(address, bobCookie);
            sockets.push(bob.socket);
          }
          if (alice.socket.readyState !== alice.socket.CLOSED) {
            const oldClosed = once(alice.socket, "close");
            alice.socket.terminate();
            await bounded(oldClosed, "old player socket closes");
          }
          const replacement = socketClient(address, aliceCookie);
          sockets.push(replacement.socket);
          const returningPeers = restart ? [replacement, bob] : [replacement];
          const [resumed, recoveredBob] = await Promise.all(
            returningPeers.map(async (peer) => {
              const returning = await peer.receive(
                "welcome",
                SERVER_COMMAND_SCHEMAS.welcome,
              );
              expect(returning.playingAtTables).toEqual([tableID]);
              peer.send("tableReattend", { tableID });
              await peer.receive(
                "tableStart",
                SERVER_COMMAND_SCHEMAS.tableStart,
              );
              return await bootstrap(peer);
            }),
          );
          assertDefined(resumed, "Missing reconnected player bootstrap.");
          expect(resumed.init.replay).toBe(false);
          expect(
            resumed.history.list.some(
              (event) => event.type === "play" || event.type === "discard",
            ),
          ).toBe(true);
          if (restart) {
            assertDefined(recoveredBob, "Missing recovered second player.");
            expect(resumed.init.ourPlayerIndex).toBe(
              aliceGame.init.ourPlayerIndex,
            );
            expect(recoveredBob.init.ourPlayerIndex).toBe(
              bobGame.init.ourPlayerIndex,
            );
            const restoredActive =
              aliceGame.init.ourPlayerIndex === 0 ? resumed : recoveredBob;
            expect(restoredActive.history.list).toEqual(acknowledged.list);
            expect(resumed.init.datetimeStarted).toBe(
              aliceGame.init.datetimeStarted,
            );
            const [recovered] = await checkpointProgress();
            assertDefined(recovered, "Missing recovered checkpoint.");
            expect(recovered.game_id).toBe(checkpoint.game_id);
            expect(recovered.turn).toBe(checkpoint.turn);
            expect(recovered.revision).toBeGreaterThan(checkpoint.revision);
            for (const [index, time] of recovered.clocks.entries()) {
              const previous: number | undefined = checkpoint.clocks[index];
              assertDefined(previous, "Missing pre-crash clock.");
              const allowance = crash ? 0 : 20_000;
              expect(time).toBeLessThanOrEqual(previous + allowance);
              expect(time).toBeGreaterThan(0);
              if (!crash) {
                expect(time).toBeGreaterThan(previous);
              }
              if (index !== checkpoint.active_player_index) {
                expect(time).toBe(previous + allowance);
              }
            }
          }
          replacement.send("note", {
            tableID,
            order: 0,
            note: "retained note",
            requestID: "note-once",
          });
          replacement.send("tag", {
            tableID,
            msg: "compiled smoke",
            room: `table${tableID}`,
            requestID: "tag-once",
          });
          replacement.send("chat", {
            room: `table${tableID}`,
            msg: "retained authored chat",
            requestID: "chat-once",
          });
          if (signal === undefined && domain === "localhost") {
            replacement.send("tableVoteForTermination", {
              tableID,
              requestID: "alice-vote",
            });
            await replacement.receive(
              "voteChange",
              SERVER_COMMAND_SCHEMAS.voteChange,
              (data) => data.vote,
            );
            bob.send("tableVoteForTermination", {
              tableID,
              requestID: "bob-vote",
            });
          } else {
            replacement.send("tableTerminate", {
              tableID,
              requestID: "finish-once",
            });
          }
          const finished = await replacement.receive(
            "finishOngoingGame",
            SERVER_COMMAND_SCHEMAS.finishOngoingGame,
          );
          expect(finished.databaseID).toBe(checkpoint.game_id);
          const historyRow = z
            .object({
              id: z.number().int(),
              incrementNumGames: z.boolean(),
            })
            .readonly();
          await replacement.receive(
            "gameHistory",
            historyRow.array().readonly(),
            (rows) =>
              rows.some(
                (row) =>
                  row.id === finished.databaseID && row.incrementNumGames,
              ),
          );
          replacement.send("replayAction", { tableID, type: 0, segment: 1 });
          const replayPosition = await replacement.receive(
            "replaySegment",
            SERVER_COMMAND_SCHEMAS.replaySegment,
          );
          expect(replayPosition.segment).toBe(1);
          replacement.send("getGameInfo2", { tableID });
          const replayHistory = await replacement.receive(
            "gameActionList",
            SERVER_COMMAND_SCHEMAS.gameActionList,
          );
          expect(
            replayHistory.list
              .filter((event) => event.type === "draw")
              .every((event) => event.rank > 0),
          ).toBe(true);
          expect(
            await client`SELECT id FROM games WHERE id = ${finished.databaseID}`,
          ).toHaveLength(1);
          expect(await client`SELECT id FROM games`).toEqual([
            { id: checkpoint.game_id },
          ]);
          expect(await client`SELECT game_id FROM active_games`).toHaveLength(
            0,
          );
          expect(await checkpointProgress()).toHaveLength(0);
          expect(
            await client`SELECT user_id FROM chat_log WHERE message = 'retained authored chat'`,
          ).toHaveLength(1);
          bob.send("tableUnattend", { tableID });
          replacement.send("tableUnattend", { tableID });
          const gone = await replacement.receive(
            "tableGone",
            SERVER_COMMAND_SCHEMAS.tableGone,
          );
          expect(gone.tableID).toBe(tableID);
          if (signal === undefined && domain === "localhost") {
            const banned = await fetch(`${operationsAddress}/ban`, {
              method: "POST",
              body: new URLSearchParams({ username: "SmokeAlice" }),
            });
            expect(banned.status).toBe(200);
            await banned.text();
            const denied = await fetch(`${address}/login`, {
              method: "POST",
              body: new URLSearchParams({
                username: "SmokeAlice",
                password: "synthetic-smoke-password",
                version: "1",
              }),
            });
            expect(denied.status).toBe(401);
            await denied.text();
            const stopped = once(processState.child, "close");
            const stop = await fetch(`${operationsAddress}/shutdown`);
            expect(stop.status).toBe(200);
            await stop.text();
            await bounded(stopped, "empty server scheduled shutdown", 5000);
            expect(processState.child.exitCode).toBe(0);
          }
          const listeners = [
            ...processState
              .output()
              .matchAll(/Server listening at http:\/\/([^\s:]+):/gu),
          ];
          expect(listeners.map((match) => match[1])).toEqual(
            signal === "HTTP" ? ["127.0.0.1", "127.0.0.1"] : ["127.0.0.1"],
          );
        } catch (error) {
          throw new Error(
            `Compiled process smoke failed.\n${outputBeforeCrash}\n${processState?.output() ?? "Process not started."}`,
            { cause: error },
          );
        } finally {
          for (const socket of sockets) {
            socket.terminate();
          }
          try {
            if (processState !== undefined) {
              await stopChild(processState.child);
            }
          } finally {
            await redis?.close();
            try {
              await client.end({ timeout: 3 });
            } finally {
              try {
                await database.close();
              } finally {
                if (directory !== undefined) {
                  await rm(directory, { recursive: true, force: true });
                }
              }
            }
          }
        }
      },
      language === "rust" ? 600_000 : 60_000,
    );

    test(
      "preserves six-player variants, characters, and shadow privacy through replay imports",
      async () => {
        const database = await evaluationDatabase();
        const sql = database.connect();
        await mkdir(path.join(ROOT, "dist"), { recursive: true });
        const directory = await mkdtemp(path.join(ROOT, "dist/native-parity-"));
        let state: ReturnType<typeof startProcess> | undefined;
        let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
        const sockets: WebSocket[] = [];
        try {
          await sql.unsafe(
            await readFile(
              path.join(ROOT, "install/database_schema.sql"),
              "utf8",
            ),
          );
          const version = expectedSchemaVersion(
            await readdir(path.join(ROOT, "install/migrations")),
          );
          await sql`CREATE TABLE public.schema_version (version integer PRIMARY KEY)`;
          await sql`INSERT INTO public.schema_version VALUES (${version})`;
          await run("bash", [path.join(ROOT, "packages/server/build.sh")], {
            cwd: ROOT,
            timeout: 30_000,
          });
          await prepareRoot(directory, database, "localhost");
          if (language === "rust") {
            redis = await redisFixture();
            await appendFile(
              path.join(directory, ".env"),
              `REDIS_URL=${redis.url}\n`,
            );
            await buildRust(directory);
          }
          state = startProcess(directory, undefined, language === "rust");
          let address = await bounded(
            state.ready,
            "six-player parity readiness",
          );
          const peers = await Promise.all(
            Array.from({ length: 7 }, async (_, index) => {
              const cookie = await login(address, `Parity${index}`);
              const peer = socketClient(address, cookie);
              sockets.push(peer.socket);
              await peer.receive("welcome", SERVER_COMMAND_SCHEMAS.welcome);
              return { ...peer, cookie };
            }),
          );
          const owner = peers[0];
          const observer = peers[6];
          assertDefined(owner, "Missing owner.");
          assertDefined(observer, "Missing observer.");
          owner.send("tableCreate", {
            name: "Six-player variant parity",
            maxPlayers: 6,
            options: {
              variantName: "Rainbow (6 Suits)",
              detrimentalCharacters: true,
              oneLessCard: true,
              cardCycle: true,
              emptyClues: true,
            },
          });
          const { tableID } = await owner.receive(
            "joined",
            SERVER_COMMAND_SCHEMAS.joined,
          );
          const players = peers.slice(0, 6);
          await Promise.all(
            players.slice(1).map(async (peer) => {
              peer.send("tableJoin", { tableID });
              await peer.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
            }),
          );
          owner.send("tableStart", { tableID });
          async function bootstrap(
            peer: ReturnType<typeof socketClient>,
            id: number,
          ) {
            peer.send("getGameInfo1", { tableID: id });
            const init = await peer.receive(
              "init",
              SERVER_COMMAND_SCHEMAS.init,
            );
            peer.send("getGameInfo2", { tableID: id });
            const history = await peer.receive(
              "gameActionList",
              SERVER_COMMAND_SCHEMAS.gameActionList,
            );
            peer.send("loaded", { tableID: id });
            return { init, history };
          }
          const games = await Promise.all(
            players.map(async (peer) => {
              await peer.receive(
                "tableStart",
                SERVER_COMMAND_SCHEMAS.tableStart,
              );
              return await bootstrap(peer, tableID);
            }),
          );
          for (const game of games) {
            expect(game.init.playerNames).toHaveLength(6);
            expect(game.init.options).toMatchObject({
              numPlayers: 6,
              variantName: "Rainbow (6 Suits)",
              detrimentalCharacters: true,
              oneLessCard: true,
              cardCycle: true,
              emptyClues: true,
            });
            expect(game.init.characterAssignments).toHaveLength(6);
            expect(
              game.init.characterAssignments.every((value) => value >= 0),
            ).toBe(true);
            const hand = game.history.list.filter(
              (event) =>
                event.type === "draw"
                && event.playerIndex === game.init.ourPlayerIndex,
            );
            expect(hand).toHaveLength(2);
            expect(
              hand.every((event) => event.type === "draw" && event.rank === -1),
            ).toBe(true);
          }
          observer.send("tableSpectate", { tableID, shadowingPlayerIndex: 0 });
          await observer.receive(
            "tableStart",
            SERVER_COMMAND_SCHEMAS.tableStart,
          );
          const shadow = await bootstrap(observer, tableID);
          expect(shadow.init).toMatchObject({
            spectating: true,
            shadowing: true,
            ourPlayerIndex: 0,
          });
          expect(
            shadow.history.list.filter(
              (event) => event.type === "draw" && event.playerIndex === 0,
            ),
          ).toEqual([
            expect.objectContaining({ rank: -1, suitIndex: -1 }),
            expect.objectContaining({ rank: -1, suitIndex: -1 }),
          ]);
          owner.send("tableTerminate", { tableID });
          const finished = await owner.receive(
            "finishOngoingGame",
            SERVER_COMMAND_SCHEMAS.finishOngoingGame,
          );
          expect(
            await sql`SELECT seat FROM game_participants WHERE game_id=${finished.databaseID}`,
          ).toHaveLength(6);
          const exported = await fetch(
            `${address}/export/${finished.databaseID}`,
          );
          expect(exported.status).toBe(200);
          const replayJSON: unknown = await exported.json();
          const replay = importReplay(replayJSON);
          expect(replay.warnings).toEqual([]);
          expect(replay.state.options.numPlayers).toBe(6);
          expect(replay.state.options.variantName).toBe("Rainbow (6 Suits)");
          expect(replay.state.endCondition).not.toBe(0);
          for (const peer of peers) {
            peer.send("tableUnattend", { tableID });
          }
          await owner.receive(
            "tableGone",
            SERVER_COMMAND_SCHEMAS.tableGone,
            (message) => message.tableID === tableID,
          );
          /* eslint-disable no-await-in-loop -- One client's replay imports must complete in wire order. */
          for (const source of ["id", "json"] as const) {
            owner.send(
              "replayCreate",
              source === "id"
                ? {
                    source,
                    visibility: "solo",
                    databaseID: finished.databaseID,
                  }
                : { source, visibility: "shared", gameJSON: replayJSON },
            );
            const created = await owner.receive(
              "tableStart",
              SERVER_COMMAND_SCHEMAS.tableStart,
            );
            const imported = await bootstrap(owner, created.tableID);
            expect(imported.init.replay).toBe(true);
            expect(imported.init.playerNames).toHaveLength(6);
            const original = games[0];
            assertDefined(original, "Missing original player bootstrap.");
            expect(imported.init.options).toMatchObject(original.init.options);
            expect(imported.init.characterAssignments).toEqual(
              original.init.characterAssignments,
            );
            expect(
              imported.history.list
                .filter((event) => event.type === "draw")
                .every((event) => event.rank > 0),
            ).toBe(true);
            let replayPeer: ReturnType<typeof socketClient> = owner;
            if (language === "rust" && source === "json") {
              owner.send("tableCreate", {
                name: "Recover this pregame",
                password: "preserved-password",
                maxPlayers: 3,
                options: { variantName: "Rainbow (6 Suits)" },
              });
              const pending = await owner.receive(
                "joined",
                SERVER_COMMAND_SCHEMAS.joined,
              );
              const crashed = once(state.child, "close");
              state.child.kill("SIGKILL");
              await bounded(crashed, "pregame and replay process crash");
              state = startProcess(directory, undefined, true);
              address = await bounded(
                state.ready,
                "pregame and replay recovery",
              );
              const returning = socketClient(address, owner.cookie);
              sockets.push(returning.socket);
              await returning.receive(
                "welcome",
                SERVER_COMMAND_SCHEMAS.welcome,
              );
              returning.send("tableReattend", { tableID: pending.tableID });
              const pregame = await returning.receive(
                "game",
                SERVER_COMMAND_SCHEMAS.game,
                (message) => message.tableID === pending.tableID,
              );
              expect(pregame).toMatchObject({
                name: "Recover this pregame",
                passwordProtected: true,
                maxPlayers: 3,
                options: { variantName: "Rainbow (6 Suits)" },
              });
              const returningObserver = socketClient(address, observer.cookie);
              sockets.push(returningObserver.socket);
              await returningObserver.receive(
                "welcome",
                SERVER_COMMAND_SCHEMAS.welcome,
              );
              returningObserver.send("tableJoin", {
                tableID: pending.tableID,
                password: "preserved-password",
              });
              await returningObserver.receive(
                "joined",
                SERVER_COMMAND_SCHEMAS.joined,
                (message) => message.tableID === pending.tableID,
              );
              returning.send("tableReattend", { tableID: created.tableID });
              await returning.receive(
                "tableStart",
                SERVER_COMMAND_SCHEMAS.tableStart,
                (message) => message.tableID === created.tableID,
              );
              const recovered = await bootstrap(returning, created.tableID);
              expect(recovered.init).toMatchObject({
                replay: true,
                sharedReplay: true,
                sharedReplaySegment: imported.init.sharedReplaySegment,
                datetimeStarted: imported.init.datetimeStarted,
              });
              expect(recovered.init.characterAssignments).toEqual(
                imported.init.characterAssignments,
              );
              expect(recovered.history.list).toEqual(imported.history.list);
              returningObserver.send("tableLeave", {
                tableID: pending.tableID,
              });
              returning.send("tableLeave", { tableID: pending.tableID });
              await returning.receive(
                "tableGone",
                SERVER_COMMAND_SCHEMAS.tableGone,
                (message) => message.tableID === pending.tableID,
              );
              replayPeer = returning;
            }
            replayPeer.send("tableUnattend", { tableID: created.tableID });
            replayPeer.send("getName", {});
            await replayPeer.receive("name", SERVER_COMMAND_SCHEMAS.name);
          }
          /* eslint-enable no-await-in-loop */
        } catch (error) {
          throw new Error(
            `Six-player ${language} parity failed.\n${state?.output() ?? ""}`,
            { cause: error },
          );
        } finally {
          for (const socket of sockets) {
            socket.terminate();
          }
          if (state !== undefined) {
            await stopChild(state.child);
          }
          await redis?.close();
          await sql.end({ timeout: 3 });
          await database.close();
          await rm(directory, { recursive: true, force: true });
        }
      },
      language === "rust" ? 600_000 : 60_000,
    );
  },
);
