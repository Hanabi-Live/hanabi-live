/* eslint-disable no-await-in-loop -- Each lane follows the actual client protocol in order. */
import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
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
import { z } from "zod";
import { evaluationDatabase } from "./database";
import {
  ROOT,
  bounded,
  buildGo,
  buildRust,
  databaseDescribe,
  login,
  prepareRoot,
  run,
  socketClient,
  startProcess,
  stopChild,
  unusedPort,
} from "./mainProcessSupport";
import { redisFixture } from "./redisFixture";
import { expectedSchemaVersion } from "./schemaVersion";

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
      expect(bounded(processState.ready, "Go restart fence")).rejects.toThrow(
        "Go-to-Rust cutover",
      );
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
      processState = startProcess(directory, undefined);
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
      const archive = z
        .object({ notes: z.string().array().array() })
        .parse(await exported.json());
      expect(archive.notes.flat()).toContain("retained across cutover");
      expect(await sql`SELECT id FROM games`).toEqual<unknown>([
        { id: source.game_id },
      ]);
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
