import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { describe, expect, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { z } from "zod";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import { expectedSchemaVersion } from "./migrationFiles";

const ROOT = path.resolve(__dirname, "../../..");
const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

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

function startProcess(directory: string) {
  const child = spawn(process.execPath, ["packages/server/dist/main.js"], {
    cwd: directory,
    env: {
      PATH: process.env["PATH"],
      HOME: directory,
      TMPDIR: directory,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = Promise.withResolvers<string>();
  let output = "";
  function collect(chunk: Buffer) {
    output = (output + chunk.toString()).slice(-32_768);
    const address = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/u.exec(
      output,
    )?.[1];
    if (address !== undefined) {
      ready.resolve(address);
    }
  }
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("error", (error) => {
    ready.reject(error);
  });
  child.once("exit", (code, signal) => {
    ready.reject(
      new Error(`Compiled server exited (${code ?? signal}).\n${output}`),
    );
  });
  return { child, ready: ready.promise, output: () => output };
}

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
        bob.send("tableJoin", {
          tableID,
          password: "synthetic-table-password",
        });
        await bob.receive("joined", SERVER_COMMAND_SCHEMAS.joined);
        alice.send("tableStart", { tableID, requestID: "start-once" });
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
        replacement.send("tableTerminate", {
          tableID,
          requestID: "finish-once",
        });
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
        const listeners = [
          ...processState
            .output()
            .matchAll(/Server listening at http:\/\/([^\s:]+):/gu),
        ];
        expect(listeners.map((match) => match[1])).toEqual(["127.0.0.1"]);
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
