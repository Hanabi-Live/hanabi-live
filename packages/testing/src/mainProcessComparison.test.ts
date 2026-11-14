/* eslint-disable no-await-in-loop -- Each lane follows the actual client protocol in order. */
import { DEFAULT_MAX_PLAYERS, SERVER_EVENT_SCHEMAS } from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { evaluationDatabase } from "./database.ts";
import {
  bounded,
  buildRust,
  cookieUserId,
  databaseDescribe,
  entersGame,
  installSchema,
  login,
  ourPlayerIndex,
  prepareRoot,
  ROOT,
  settleLanes,
  socketClient,
  startProcess,
  stopChild,
  summary,
} from "./mainProcessSupport.ts";

/** The deal of this two-player seed lets the players alternate 25 plays. */
const SEED_SUFFIX = "77621";
/** The card order that each turn plays. */
const PLAYS = [
  0, 8, 3, 11, 12, 13, 14, 15, 4, 17, 16, 19, 20, 9, 2, 21, 24, 6, 10, 25, 28,
  27, 22, 31, 18,
] as const;

databaseDescribe("normal-server protocol workload", () => {
  test("executes matched gameplay, live reconnects, and cold historical replays", async () => {
    const database = await evaluationDatabase();
    const sql = database.connect();
    await mkdir(path.join(ROOT, "dist"), { recursive: true });
    const directory = await mkdtemp(path.join(ROOT, "dist/normal-comparison-"));
    let processState: ReturnType<typeof startProcess> | undefined;
    const sockets = new Set<WebSocket>();
    const samples = {
      action: [] as number[],
      liveReconnect: [] as number[],
      replay: [] as number[],
      reconnect: [] as number[],
      replayHistoryReady: [] as number[],
      reconnectHistoryReady: [] as number[],
    };
    let peakRssKib = 0;
    const completed: Array<{
      gameId: number;
      aliceCookie: string;
      bobCookie: string;
    }> = [];
    try {
      await prepareRoot(directory, database, "localhost");
      await buildRust(directory);
      await installSchema(directory);
      processState = startProcess(directory);
      let address = await bounded(processState.ready, "Server readiness");
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
        peakRssKib = Math.max(
          peakRssKib,
          Number(/VmHWM:\s+(\d+)/u.exec(status)?.[1] ?? 0),
        );
      }

      async function connect(cookie: string) {
        const peer = socketClient(address, cookie);
        sockets.add(peer.socket);
        await peer.receive("welcome", SERVER_EVENT_SCHEMAS.welcome);
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
        tableId: number,
      ) {
        await peer.request("tableUnattend", { tableId });
      }

      async function bootstrap(
        peer: ReturnType<typeof socketClient>,
        tableId: number,
      ) {
        const init = await peer.request("gameInitLoad", { tableId });
        peer.send("gameStateLoad", { tableId });
        const history = await peer.receive(
          "gameState",
          SERVER_EVENT_SCHEMAS.gameState,
        );
        if (
          init.mode.type !== "soloReplay"
          && init.mode.type !== "sharedReplay"
        ) {
          peer.send("gameLoaded", { tableId });
        }
        return { init, history };
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
              settings: {
                name: "Benchmark",
                maxPlayers: DEFAULT_MAX_PLAYERS,
                options: {},
                deal: { type: "seed", suffix: SEED_SUFFIX },
              },
            });
            const { tableId } = await alice.receive(
              "tableJoined",
              SERVER_EVENT_SCHEMAS.tableJoined,
            );
            bob.send("tableJoin", { tableId });
            await bob.receive("tableJoined", SERVER_EVENT_SCHEMAS.tableJoined);
            alice.send("tableStart", {
              tableId,
              intendedPlayerIds: [
                cookieUserId(aliceCookie),
                cookieUserId(bobCookie),
              ],
            });
            await alice.receive(
              "tableJoined",
              SERVER_EVENT_SCHEMAS.tableJoined,
              entersGame,
            );
            await bob.receive(
              "tableJoined",
              SERVER_EVENT_SCHEMAS.tableJoined,
              entersGame,
            );
            const [a, b] = await Promise.all([
              bootstrap(alice, tableId),
              bootstrap(bob, tableId),
            ]);
            const aliceSeat = ourPlayerIndex(a.init);
            const bobSeat = ourPlayerIndex(b.init);
            assertDefined(aliceSeat, "Alice has no seat.");
            assertDefined(bobSeat, "Bob has no seat.");
            expect(
              [aliceSeat, bobSeat].toSorted((left, right) => left - right),
            ).toEqual([0, 1]);
            for (const [turn, order] of PLAYS.entries()) {
              const peer = turn % 2 === aliceSeat ? alice : bob;
              const start = performance.now();
              peer.send("playerAction", {
                tableId,
                action: { type: "play", order },
              });
              await peer.receive(
                "gameEvent",
                SERVER_EVENT_SCHEMAS.gameEvent,
                (data) =>
                  data.events.some(
                    (event) => event.type === "play" && event.order === order,
                  ),
              );
              samples.action.push(performance.now() - start);
              if (turn === 4) {
                const reconnectStart = performance.now();
                await close(alice);
                alice = await connect(aliceCookie);
                alice.send("tableReattend", { tableId });
                await alice.receive(
                  "tableJoined",
                  SERVER_EVENT_SCHEMAS.tableJoined,
                  entersGame,
                );
                const restored = await bootstrap(alice, tableId);
                expect(ourPlayerIndex(restored.init)).toBe(aliceSeat);
                expect(
                  restored.history.events.filter(
                    (event) => event.type === "play",
                  ),
                ).toHaveLength(5);
                expect(
                  restored.history.events.some(
                    (event) =>
                      event.type === "draw"
                      && event.playerIndex === aliceSeat
                      && event.identity === undefined,
                  ),
                ).toBe(true);
                samples.liveReconnect.push(performance.now() - reconnectStart);
              }
            }
            await alice.receive(
              "gameHistoryAdded",
              SERVER_EVENT_SCHEMAS.gameHistoryAdded,
              (entry) => entry.score === 25,
            );
            const finished = await bootstrap(alice, tableId);
            expect(finished.init.mode.type).toBe("sharedReplay");
            expect(
              finished.history.events.filter((event) => event.type === "play"),
            ).toHaveLength(25);
            const gameId =
              finished.init.mode.type === "sharedReplay"
                ? finished.init.mode.gameId
                : undefined;
            assertDefined(gameId, "The finished game was not saved.");
            completed.push({
              gameId,
              aliceCookie,
              bobCookie,
            });
            for (const peer of [alice, bob]) {
              await unattend(peer, tableId);
              await close(peer);
            }
          }
        }),
      );
      const gameplayMilliseconds = performance.now() - gameplayStart;
      expect(await sql`SELECT score FROM games`).toEqual<unknown>(
        Array.from({ length: 8 }, () => ({ score: 25 })),
      );
      expect(
        await sql`SELECT count(*)::int AS count FROM game_actions`,
      ).toEqual<unknown>([{ count: 200 }]);
      expect(
        await sql`SELECT count(*)::int AS count FROM game_participants`,
      ).toEqual<unknown>([{ count: 16 }]);
      expect(
        await sql`
          SELECT g.seed, (SELECT jsonb_agg(a.target ORDER BY a.turn)
            FROM game_actions a WHERE a.game_id=g.id AND a.type=0) AS plays
          FROM games g
        `,
      ).toEqual<unknown>(
        Array.from({ length: 8 }, () => ({
          seed: `p2v0s${SEED_SUFFIX}`,
          plays: PLAYS,
        })),
      );
      const statsDeadline = performance.now() + 5000;
      for (;;) {
        const [stats] = await sql<Array<{ users: number }>>`
          SELECT COALESCE((SELECT SUM(num_games) FROM user_stats WHERE variant_id=0),0)::int AS users
        `;
        if (stats?.users === 16) {
          break;
        }
        if (performance.now() > statsDeadline) {
          throw new Error("Derived statistics did not settle.");
        }
        await delay(10);
      }
      await sample();
      await stopChild(processState.child);
      processState = startProcess(directory);
      address = await bounded(
        processState.ready,
        "Server cold replay readiness",
      );
      await delay(50);
      const readStart = performance.now();
      async function readReplay(
        peer: ReturnType<typeof socketClient>,
        gameId: number,
      ) {
        peer.send("replayCreate", {
          source: { type: "saved", gameId },
          visibility: { type: "solo" },
        });
        const { tableId } = await peer.receive(
          "tableJoined",
          SERVER_EVENT_SCHEMAS.tableJoined,
          entersGame,
        );
        const replay = await bootstrap(peer, tableId);
        expect(replay.init.mode).toMatchObject({ type: "soloReplay", gameId });
        expect(
          replay.history.events.filter((event) => event.type === "play"),
        ).toHaveLength(25);
        const historyReady = performance.now();
        await unattend(peer, tableId);
        return historyReady;
      }
      await settleLanes(
        completed.map(async (game) => {
          const peer = await connect(game.bobCookie);
          await settleLanes([
            (async () => {
              for (let index = 0; index < 20; index++) {
                const start = performance.now();
                const ready = await readReplay(peer, game.gameId);
                samples.replayHistoryReady.push(ready - start);
                samples.replay.push(performance.now() - start);
              }
            })(),
            (async () => {
              for (let index = 0; index < 10; index++) {
                const start = performance.now();
                const returning = await connect(game.aliceCookie);
                const ready = await readReplay(returning, game.gameId);
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
      const latency = Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          summary(values),
        ]),
      );
      console.info(
        "NORMAL_SERVER_EVALUATION",
        JSON.stringify({
          language: "rust",
          driverBun: process.versions.bun,
          scope:
            "Release-mode server with real login, cookies, client protocol, and disposable PostgreSQL live state and history. Not a capacity benchmark.",
          seed: `p2v0s${SEED_SUFFIX}`,
          games: completed.length,
          lanes: 4,
          peakRssKib,
          stateStore: "PostgreSQL",
          gameplayMilliseconds,
          mixedReadMilliseconds: performance.now() - readStart,
          latency,
        }),
      );
    } catch (error) {
      throw new Error(
        `Server evaluation failed.\n${processState?.output() ?? ""}`,
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
  }, 600_000);
});
