import {
  SERVER_COMMAND_SCHEMAS,
  VERSION,
  noticeSchema,
  replayGameSchema,
} from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { z } from "zod";
import { evaluationDatabase, liveTables } from "./database";
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
      let outputBeforeCrash = "";
      const sockets: WebSocket[] = [];
      async function checkpointProgress(): Promise<
        readonly CheckpointProgress[]
      > {
        const stored = await liveTables(client);
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
            // Each step in these games is one turn.
            turn: snapshot.game.steps.length,
            active_player_index:
              snapshot.game.steps.length % snapshot.players.length,
            clocks: snapshot.clocks,
          };
        });
      }
      try {
        await mkdir(path.join(ROOT, "dist"), { recursive: true });
        directory = await mkdtemp(path.join(ROOT, "dist/server-process-"));
        await prepareRoot(directory, database, domain);
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
            lobbyDatabase: poolSchema,
            recovery: z.object({
              storageInitialized: z.literal(true),
            }),
          })
          .parse(await metrics.json());
        expect(reports.database.maxConnections).toBe(14);
        expect(reports.database.totalConnections).toBeLessThanOrEqual(14);
        expect(reports.lobbyDatabase.maxConnections).toBe(2);
        expect(reports.lobbyDatabase.totalConnections).toBeLessThanOrEqual(2);
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
          password: "synthetic-table-password",
          settings: {
            name: "Compiled smoke table",
            options: {
              variantName: "No Variant",
              timed: restart,
              timeBaseSeconds: 600,
              timePerTurnSeconds: 2,
            },
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
        const game = await bob.receive(
          "pregame",
          SERVER_COMMAND_SCHEMAS.pregame,
        );
        expect(game.players.map((player) => player.username)).toEqual([
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
        alice.send("tableStart", { tableID });
        await alice.receive(
          "tableStarted",
          SERVER_COMMAND_SCHEMAS.tableStarted,
        );
        await bob.receive("tableStarted", SERVER_COMMAND_SCHEMAS.tableStarted);

        async function bootstrap(peer: ReturnType<typeof socketClient>) {
          peer.send("getGameInit", { tableID });
          const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
          peer.send("getGameState", { tableID });
          const history = await peer.receive(
            "gameEventList",
            SERVER_COMMAND_SCHEMAS.gameEventList,
          );
          peer.send("loaded", { tableID });
          await peer.receive(
            "connected",
            SERVER_COMMAND_SCHEMAS.connected,
            (data) => data.connected.every(Boolean),
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
        const card = activeGame.history.events.find(
          (event) => event.type === "draw" && event.playerIndex === 0,
        );
        assertDefined(card, "Missing first player's initial draw.");
        if (card.type !== "draw") {
          throw new Error("Expected an initial draw.");
        }
        expect(card.rank).toBeUndefined();
        active.send("playerAction", {
          tableID,
          action: { type: "play", order: card.order },
        });
        await active.receive("gameEvent", SERVER_COMMAND_SCHEMAS.gameEvent);
        active.send("getGameState", { tableID });
        const acknowledged = await active.receive(
          "gameEventList",
          SERVER_COMMAND_SCHEMAS.gameEventList,
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
            await peer.receive(
              "tableStarted",
              SERVER_COMMAND_SCHEMAS.tableStarted,
            );
            return await bootstrap(peer);
          }),
        );
        assertDefined(resumed, "Missing reconnected player bootstrap.");
        expect(resumed.init.mode).toBe("playing");
        expect(
          resumed.history.events.some(
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
          expect(restoredActive.history.events).toEqual(acknowledged.events);
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
          tag: "compiled smoke",
        });
        replacement.send("chat", {
          tableID,
          text: "retained authored chat",
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
          // The other player sees the vote without having cast one.
          await bob.receive(
            "voteChange",
            SERVER_COMMAND_SCHEMAS.voteChange,
            (data) => !data.vote && data.votes === 1 && data.votesNeeded === 2,
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
        assertDefined(finished.gameID, "The finished game was not saved.");
        expect<number>(finished.gameID).toBe(checkpoint.game_id);
        await replacement.receive(
          "gameHistoryAdded",
          SERVER_COMMAND_SCHEMAS.gameHistoryAdded,
          (row) => row.gameID === finished.gameID,
        );
        replacement.send("replayAction", {
          tableID,
          action: { type: "segment", segment: 1 },
        });
        const replayPosition = await replacement.receive(
          "replayAction",
          SERVER_COMMAND_SCHEMAS.replayAction,
        );
        expect(replayPosition).toMatchObject({
          action: { type: "segment", segment: 1 },
        });
        replacement.send("getGameState", { tableID });
        const replayHistory = await replacement.receive(
          "gameEventList",
          SERVER_COMMAND_SCHEMAS.gameEventList,
        );
        expect(
          replayHistory.events
            .filter((event) => event.type === "draw")
            .every((event) => event.rank !== undefined),
        ).toBe(true);
        expect(
          await client`SELECT id FROM games WHERE id = ${finished.gameID}`,
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
          expect(noticeSchema.parse(await denied.json()).message).toContain(
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
    const sockets: WebSocket[] = [];
    try {
      await prepareRoot(directory, database, "localhost");
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
        settings: {
          name: "Six-player variant parity",
          maxPlayers: 6,
          options: {
            variantName: "Rainbow (6 Suits)",
            detrimentalCharacters: true,
            oneLessCard: true,
            emptyClues: true,
          },
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
        peer.send("getGameInit", { tableID: id });
        const init = await peer.receive("init", SERVER_COMMAND_SCHEMAS.init);
        peer.send("getGameState", { tableID: id });
        const history = await peer.receive(
          "gameEventList",
          SERVER_COMMAND_SCHEMAS.gameEventList,
        );
        peer.send("loaded", { tableID: id });
        return { init, history };
      }
      const games = await Promise.all(
        players.map(async (peer) => {
          await peer.receive(
            "tableStarted",
            SERVER_COMMAND_SCHEMAS.tableStarted,
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
          emptyClues: true,
        });
        expect(game.init.characters).toHaveLength(6);
        expect(
          game.init.characters.every(
            (character) => character.characterID !== undefined,
          ),
        ).toBe(true);
        const hand = game.history.events.filter(
          (event) =>
            event.type === "draw"
            && event.playerIndex === game.init.ourPlayerIndex,
        );
        expect(hand).toHaveLength(2);
        expect(
          hand.every(
            (event) => event.type === "draw" && event.rank === undefined,
          ),
        ).toBe(true);
      }
      observer.send("tableSpectate", { tableID, shadowingPlayerIndex: 0 });
      await observer.receive(
        "tableStarted",
        SERVER_COMMAND_SCHEMAS.tableStarted,
      );
      const shadow = await bootstrap(observer, tableID);
      expect(shadow.init).toMatchObject({
        mode: "shadowing",
        ourPlayerIndex: 0,
      });
      expect(
        shadow.history.events
          .filter((event) => event.type === "draw" && event.playerIndex === 0)
          .map((event) => "suitIndex" in event || "rank" in event),
      ).toEqual([false, false]);
      // The client rebuilds the game when it finishes, so it needs the identities of the scrubbed
      // cards first.
      const arrivals: string[] = [];
      owner.socket.on("message", (raw) => {
        if (Buffer.isBuffer(raw)) {
          arrivals.push(raw.toString().split(" ", 1)[0] ?? "");
        }
      });
      owner.send("tableTerminate", { tableID });
      const finished = await owner.receive(
        "finishOngoingGame",
        SERVER_COMMAND_SCHEMAS.finishOngoingGame,
      );
      await owner.receive(
        "cardIdentities",
        SERVER_COMMAND_SCHEMAS.cardIdentities,
      );
      expect(arrivals.indexOf("cardIdentities")).toBeLessThan(
        arrivals.indexOf("finishOngoingGame"),
      );
      assertDefined(finished.gameID, "The finished game was not saved.");
      expect(
        await sql`SELECT seat FROM game_participants WHERE game_id=${finished.gameID}`,
      ).toHaveLength(6);
      const exported = await fetch(`${address}/export/${finished.gameID}`);
      expect(exported.status).toBe(200);
      const replayJSON = replayGameSchema.parse(await exported.json());
      expect(replayJSON.playerNames).toHaveLength(6);
      expect(replayJSON.options?.variantName).toBe("Rainbow (6 Suits)");
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
                gameID: finished.gameID,
              }
            : { source, visibility: "shared", gameJSON: replayJSON },
        );
        const created = await owner.receive(
          "tableStarted",
          SERVER_COMMAND_SCHEMAS.tableStarted,
        );
        const imported = await bootstrap(owner, created.tableID);
        expect(imported.init.mode).toBe(
          source === "id" ? "replay" : "sharedReplay",
        );
        expect(imported.init.playerNames).toHaveLength(6);
        expect(imported.history.events).toEqual<unknown>(
          expect.arrayContaining([
            expect.objectContaining({ type: "gameOver" }),
          ]),
        );
        const original = games[0];
        assertDefined(original, "Missing original player bootstrap.");
        expect(imported.init.options).toMatchObject(original.init.options);
        expect(imported.init.characters).toEqual(original.init.characters);
        expect(
          imported.history.events
            .filter((event) => event.type === "draw")
            .every((event) => event.rank !== undefined),
        ).toBe(true);
        let replayPeer: ReturnType<typeof socketClient> = owner;
        if (source === "json") {
          owner.send("tableCreate", {
            password: "preserved-password",
            settings: {
              name: "Recover this pregame",
              maxPlayers: 3,
              options: { variantName: "Rainbow (6 Suits)" },
            },
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
            "pregame",
            SERVER_COMMAND_SCHEMAS.pregame,
            (message) => message.tableID === pending.tableID,
          );
          expect(pregame).toMatchObject({
            passwordProtected: true,
            settings: {
              name: "Recover this pregame",
              maxPlayers: 3,
              options: { variantName: "Rainbow (6 Suits)" },
            },
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
            "tableStarted",
            SERVER_COMMAND_SCHEMAS.tableStarted,
            (message) => message.tableID === created.tableID,
          );
          const recovered = await bootstrap(returning, created.tableID);
          expect(recovered.init).toMatchObject({
            mode: "sharedReplay",
            sharedReplay: { segment: imported.init.sharedReplay?.segment },
            datetimeStarted: imported.init.datetimeStarted,
          });
          expect(recovered.init.characters).toEqual(imported.init.characters);
          expect(recovered.history.events).toEqual(imported.history.events);
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
      await sql.end({ timeout: 3 });
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 600_000);
});
