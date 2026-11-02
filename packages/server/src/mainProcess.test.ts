import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
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
import { GoRandom, seedToInt64 } from "./engine/goRandom";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import { winningDeck } from "./experimental/scenarios";
import { expectedSchemaVersion } from "./migrationFiles";

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

function startProcess(directory: string, goPort?: number) {
  const child = spawn(
    goPort === undefined
      ? process.execPath
      : path.join(directory, "hanabi-live"),
    goPort === undefined ? ["packages/server/dist/main.js"] : [],
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
databaseDescribe("normal-server comparison", () => {
  test.each(["go", "typescript"] as const)(
    "%s executes matched gameplay, live reconnects, and cold historical replays",
    async (language) => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      await mkdir(path.join(ROOT, "dist"), { recursive: true });
      const directory = await mkdtemp(
        path.join(ROOT, "dist/normal-comparison-"),
      );
      let processState: ReturnType<typeof startProcess> | undefined;
      const sockets = new Set<WebSocket>();
      const samples = {
        action: [] as number[],
        liveReconnect: [] as number[],
        replay: [] as number[],
        reconnect: [] as number[],
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
        let goPort: number | undefined;
        if (language === "go") {
          goPort = await unusedPort();
          const operationsPort = await unusedPort();
          await appendFile(
            path.join(directory, ".env"),
            `PORT=${goPort}\nLOCALHOST_PORT=${operationsPort}\n`,
          );
          await mkdir(path.join(directory, "packages/game/src"), {
            recursive: true,
          });
          await mkdir(path.join(directory, "packages/server/src"), {
            recursive: true,
          });
          await mkdir(path.join(directory, "server/src"), {
            recursive: true,
          });
          await Promise.all([
            symlink(
              path.join(ROOT, "packages/game/src/json"),
              path.join(directory, "packages/game/src/json"),
              "dir",
            ),
            symlink(
              path.join(ROOT, "packages/server/src/json"),
              path.join(directory, "packages/server/src/json"),
              "dir",
            ),
            symlink(
              path.join(ROOT, "server/src/views"),
              path.join(directory, "server/src/views"),
              "dir",
            ),
          ]);
          await run(
            "go",
            ["build", "-o", path.join(directory, "hanabi-live"), "."],
            { cwd: path.join(ROOT, "server/src"), timeout: 120_000 },
          );
        }
        processState = startProcess(directory, goPort);
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
        await sample();
        await stopChild(processState.child);
        processState = startProcess(directory, goPort);
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
          await unattend(peer, tableID);
        }
        await settleLanes(
          completed.map(async (game) => {
            const peer = await connect(game.bobCookie);
            await settleLanes([
              (async () => {
                for (let index = 0; index < 20; index++) {
                  const start = performance.now();
                  await readReplay(peer, game.databaseID);
                  samples.replay.push(performance.now() - start);
                }
              })(),
              (async () => {
                for (let index = 0; index < 10; index++) {
                  const start = performance.now();
                  const returning = await connect(game.aliceCookie);
                  await readReplay(returning, game.databaseID);
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
            node: process.version,
            scope:
              "Separate normal server process; real login/cookies/client wire protocol; disposable local PostgreSQL. Not a capacity or language-only benchmark.",
            deckSHA256,
            games: completed.length,
            lanes: 4,
            peakRSSKiB,
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
        await sql.end({ timeout: 3 });
        await database.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    180_000,
  );
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

databaseDescribe("compiled application entry point", () => {
  test.each([
    ["completes real WebSocket gameplay on localhost", "localhost", undefined],
    ["completes real WebSocket gameplay on 127.0.0.1", "127.0.0.1", undefined],
    [
      "restores acknowledged gameplay and reserved ID after abrupt process death",
      "127.0.0.1",
      "SIGKILL",
    ],
    ["drains and preserves timed gameplay on SIGTERM", "127.0.0.1", "SIGTERM"],
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
      let outputBeforeCrash = "";
      const sockets: WebSocket[] = [];
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
        processState = startProcess(directory);
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
        expect(reports.recovery.database.totalConnections).toBeLessThanOrEqual(
          2,
        );
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
        expect(game.players.map((player) => player.you)).toEqual([false, true]);
        bob.send("tableLeave", { tableID });
        const bobLeft = await bob.receive("left", SERVER_COMMAND_SCHEMAS.left);
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
          const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
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
        const checkpoints = await client<CheckpointProgress[]>`
          SELECT game_id, revision::integer AS revision,
            (checkpoint::jsonb -> 'game' -> 'state' ->> 'turn')::integer AS turn,
            (checkpoint::jsonb -> 'game' -> 'state' ->> 'activePlayerIndex')::integer AS active_player_index,
            checkpoint::jsonb -> 'game' -> 'clocks' AS clocks
          FROM active_games
        `;
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
              expect(processState.output()).toContain("successfully shut down");
            }
            processState = startProcess(directory);
            address = await bounded(
              processState.ready,
              "restarted compiled server readiness",
            );
          }
          const retained = await client<CheckpointProgress[]>`
            SELECT game_id, revision::integer AS revision,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'turn')::integer AS turn,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'activePlayerIndex')::integer AS active_player_index,
              checkpoint::jsonb -> 'game' -> 'clocks' AS clocks
            FROM active_games
          `;
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
            await peer.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
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
          const [recovered] = await client<CheckpointProgress[]>`
            SELECT game_id, revision::integer AS revision,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'turn')::integer AS turn,
              (checkpoint::jsonb -> 'game' -> 'state' ->> 'activePlayerIndex')::integer AS active_player_index,
              checkpoint::jsonb -> 'game' -> 'clocks' AS clocks
            FROM active_games
          `;
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
              (row) => row.id === finished.databaseID && row.incrementNumGames,
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
        expect(await client`SELECT game_id FROM active_games`).toHaveLength(0);
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
    60_000,
  );
});
