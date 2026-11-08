/* eslint-disable no-await-in-loop -- Each lane follows the actual client protocol in order. */
import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { once } from "node:events";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { evaluationDatabase } from "./database";
import {
  ROOT,
  bounded,
  buildRust,
  databaseDescribe,
  login,
  prepareRoot,
  settleLanes,
  socketClient,
  startProcess,
  stopChild,
  summary,
  wireHistorySchema,
} from "./mainProcessSupport";
import { redisFixture } from "./redisFixture";
import { expectedSchemaVersion } from "./schemaVersion";

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
        await readFile(path.join(ROOT, "install/database_schema.sql"), "utf8"),
      );
      const version = expectedSchemaVersion(
        await readdir(path.join(ROOT, "install/migrations")),
      );
      await sql`CREATE TABLE public.schema_version (version integer PRIMARY KEY)`;
      await sql`INSERT INTO public.schema_version (version) VALUES (${version})`;
      await prepareRoot(directory, database, "localhost");
      redis = await redisFixture();
      await appendFile(
        path.join(directory, ".env"),
        `REDIS_URL=${redis.url}\n`,
      );
      await buildRust(directory);
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
        peer.send("sync", {});
        await peer.receive("synced", SERVER_COMMAND_SCHEMAS.synced);
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
            alice.send("tableCreate", { name: `!seed ${SEED_SUFFIX}` });
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
            await bob.receive("tableStart", SERVER_COMMAND_SCHEMAS.tableStart);
            const [a, b] = await Promise.all([
              bootstrap(alice, tableID),
              bootstrap(bob, tableID),
            ]);
            expect(
              [a.init.ourPlayerIndex, b.init.ourPlayerIndex].toSorted(
                (left, right) => left - right,
              ),
            ).toEqual([0, 1]);
            for (const [turn, order] of PLAYS.entries()) {
              const peer = turn % 2 === a.init.ourPlayerIndex ? alice : bob;
              const start = performance.now();
              peer.send("action", {
                tableID,
                type: 0,
                target: order,
              });
              await peer.receive(
                "gameAction",
                SERVER_COMMAND_SCHEMAS.gameAction,
                (event) =>
                  event.action.type === "play" && event.action.order === order,
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
                samples.liveReconnect.push(performance.now() - reconnectStart);
              }
            }
            await alice.receive("gameHistory", wireHistorySchema, (games) =>
              games.some((entry) => entry.score === 25),
            );
            const finished = await bootstrap(alice, tableID);
            expect(finished.init.replay).toBe(true);
            expect(finished.history.list).toEqual<unknown>(
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
      processState = startProcess(directory);
      address = await bounded(
        processState.ready,
        "Server cold replay readiness",
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
        expect(replay.history.list).toEqual<unknown>(
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
            "Release-mode server with real login, cookies, client protocol, Redis AOF/WAITAOF state and disposable PostgreSQL history. Not a capacity benchmark.",
          seed: `p2v0s${SEED_SUFFIX}`,
          games: completed.length,
          lanes: 4,
          peakRSSKiB,
          stateStore: "Redis AOF/WAITAOF",
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
      await redis?.close();
      await sql.end({ timeout: 3 });
      await database.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 600_000);
});
