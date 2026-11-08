/* eslint-disable no-await-in-loop -- Each lane follows the actual client protocol in order. */
import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { once } from "node:events";
import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { evaluationDatabase } from "./database";
import {
  ROOT,
  bounded,
  buildRust,
  databaseDescribe,
  installSchema,
  login,
  prepareRoot,
  socketClient,
  startProcess,
  stopChild,
} from "./mainProcessSupport";
import { redisFixture } from "./redisFixture";

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
        await prepareRoot(directory, database, "localhost");
        redis = await redisFixture();
        await appendFile(
          path.join(directory, ".env"),
          `REDIS_URL=${redis.url}\n`,
        );
        await buildRust(directory);
        await installSchema(directory);
        state = startProcess(directory);
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
        alice.send("tableStart", { tableID });
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
        const action = {
          tableID,
          type: 0,
          target: card.order,
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
        // Resending the applied move is rejected: it is no longer this player's turn.
        replacement.send("action", action);
        await replacement.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
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
        state = startProcess(directory);
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
        await returning.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
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
