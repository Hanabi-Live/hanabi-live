import {
  SERVER_COMMAND_SCHEMAS,
  VERSION,
  apiErrorSchema,
} from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { once } from "node:events";
import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { z } from "zod";
import { evaluationDatabase } from "./database";
import type { CheckpointProgress } from "./mainProcessSupport";
import {
  ROOT,
  bounded,
  buildRust,
  databaseDescribe,
  installSchema,
  login,
  prepareRoot,
  rustProgressTableSchema,
  socketClient,
  startProcess,
  stopChild,
} from "./mainProcessSupport";
import { redisFixture } from "./redisFixture";

databaseDescribe("compiled application entry point (rust)", () => {
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
    [
      "stops through gracefulStop and resumes timed gameplay after maintenance",
      "127.0.0.1",
      "HTTP_STOP",
    ],
  ] as const)(
    "%s",
    async (_title, domain, signal) => {
      const restart = signal !== undefined;
      const crash = signal === "SIGKILL";
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
        assertDefined(redis, "Missing native checkpoint fixture.");
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
          return {
            game_id: snapshot.game_id,
            revision: record.revision,
            turn: snapshot.game.turn,
            active_player_index: snapshot.game.activePlayerIndex,
            clocks: snapshot.clocks,
          };
        });
      }
      try {
        await mkdir(path.join(ROOT, "dist"), { recursive: true });
        directory = await mkdtemp(path.join(ROOT, "dist/server-process-"));
        await prepareRoot(directory, database, domain);
        redis = await redisFixture();
        await appendFile(
          path.join(directory, ".env"),
          `REDIS_URL=${redis.url}\n`,
        );
        await buildRust(directory);
        await installSchema(directory);
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
        expect(reports.database.maxConnections).toBe(8);
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
          alice.send("tableStart", { tableID });
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
            if (signal === "HTTP_STOP") {
              const response = await fetch(`${operationsAddress}/gracefulStop`);
              expect(response.status).toBe(200);
              await response.text();
              await Promise.all(
                [alice, bob].map(
                  async (peer) =>
                    await peer.receive(
                      "restart",
                      SERVER_COMMAND_SCHEMAS.restart,
                    ),
                ),
              );
            } else {
              expect(crashed.kill(signal)).toBe(true);
            }
            await bounded(crashedClosed, "child process shutdown", 5000);
            if (crash) {
              expect(crashed.signalCode).toBe("SIGKILL");
            } else {
              expect(crashed.exitCode).toBe(0);
              expect(crashed.signalCode).toBeNull();
              expect(processState.output()).toContain("successfully shut down");
            }
            if (signal === "HTTP_STOP") {
              expect(await client`SELECT id FROM games`).toHaveLength(0);
              const stoppedCheckpoints = await checkpointProgress();
              await delay(3000);
              expect(await checkpointProgress()).toEqual(stoppedCheckpoints);
            }
            processState = startProcess(directory);
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
        });
        replacement.send("tag", {
          tableID,
          msg: "compiled smoke",
          room: `table${tableID}`,
        });
        replacement.send("chat", {
          room: `table${tableID}`,
          msg: "retained authored chat",
        });
        if (signal === undefined && domain === "localhost") {
          replacement.send("tableVoteForTermination", {
            tableID,
          });
          await replacement.receive(
            "voteChange",
            SERVER_COMMAND_SCHEMAS.voteChange,
            (data) => data.vote,
          );
          bob.send("tableVoteForTermination", {
            tableID,
          });
        } else {
          replacement.send("tableTerminate", {
            tableID,
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
        replacement.send("replayAction", {
          tableID,
          type: "segment",
          segment: 1,
        });
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
        expect(await client`SELECT id FROM games`).toEqual<unknown>([
          { id: checkpoint.game_id },
        ]);
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
              version: VERSION,
            }),
          });
          expect(denied.status).toBe(403);
          expect(apiErrorSchema.parse(await denied.json()).error).toContain(
            "banned",
          );
          const stopped = once(processState.child, "close");
          const stop = await fetch(`${operationsAddress}/gracefulStop`);
          expect(stop.status).toBe(200);
          await stop.text();
          await bounded(stopped, "empty server graceful stop", 5000);
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
    600_000,
  );

  test("preserves six-player variants, characters, and shadow privacy through replay imports", async () => {
    const database = await evaluationDatabase();
    const sql = database.connect();
    await mkdir(path.join(ROOT, "dist"), { recursive: true });
    const directory = await mkdtemp(path.join(ROOT, "dist/native-parity-"));
    let state: ReturnType<typeof startProcess> | undefined;
    let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
    const sockets: WebSocket[] = [];
    try {
      await prepareRoot(directory, database, "localhost");
      redis = await redisFixture();
      await appendFile(
        path.join(directory, ".env"),
        `REDIS_URL=${redis.url}\n`,
      );
      await buildRust(directory);
      await installSchema(directory);
      state = startProcess(directory);
      let address = await bounded(state.ready, "six-player parity readiness");
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
        const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
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
          await peer.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
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
      await observer.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
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
      ).toEqual<unknown>([
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
      const exported = await fetch(`${address}/export/${finished.databaseID}`);
      expect(exported.status).toBe(200);
      const replayJSON: unknown = await exported.json();
      const replay = z
        .object({
          players: z.string().array(),
          options: z.object({ variant: z.string() }),
        })
        .parse(replayJSON);
      expect(replay.players).toHaveLength(6);
      expect(replay.options.variant).toBe("Rainbow (6 Suits)");
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
        expect(imported.history.list).toEqual<unknown>(
          expect.arrayContaining([
            expect.objectContaining({ type: "gameOver" }),
          ]),
        );
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
        if (source === "json") {
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
          state = startProcess(directory);
          address = await bounded(state.ready, "pregame and replay recovery");
          const returning = socketClient(address, owner.cookie);
          sockets.push(returning.socket);
          await returning.receive("welcome", SERVER_COMMAND_SCHEMAS.welcome);
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
        replayPeer.send("sync", {});
        await replayPeer.receive("synced", SERVER_COMMAND_SCHEMAS.synced);
      }
      /* eslint-enable no-await-in-loop */
    } catch (error) {
      throw new Error(
        `Six-player rust parity failed.\n${state?.output() ?? ""}`,
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
  }, 600_000);
});
