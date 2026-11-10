/* eslint-disable no-await-in-loop -- Each lane follows the actual client protocol in order. */
import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { WebSocket } from "ws";
import { z } from "zod";
import { evaluationDatabase, liveTables } from "./database";
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

databaseDescribe("Rust actor durability and ownership", () => {
  test.each(["crash", "lost ownership"] as const)(
    "fences replaced sessions during persistence and recovers after %s",
    async (failure) => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      await mkdir(path.join(ROOT, "dist"), { recursive: true });
      const directory = await mkdtemp(path.join(ROOT, "dist/rust-recovery-"));
      let state: ReturnType<typeof startProcess> | undefined;
      const sockets: WebSocket[] = [];
      try {
        await prepareRoot(directory, database, "localhost");
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
        alice.send("tableCreate", { settings: { name: "Recovery" } });
        const { tableID } = await alice.receive(
          "joined",
          SERVER_COMMAND_SCHEMAS.joined,
        );
        bob.send("tableJoin", { tableID });
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
          (data) => data.connected.every(Boolean),
        );
        await bob.receive(
          "connected",
          SERVER_COMMAND_SCHEMAS.connected,
          (data) => data.connected.every(Boolean),
        );
        const activeIsAlice = a.init.ourPlayerIndex === 0;
        const active = activeIsAlice ? alice : bob;
        const other = activeIsAlice ? bob : alice;
        const initial = activeIsAlice ? a : b;
        const card = initial.history.actions.find(
          (event) => event.type === "draw" && event.playerIndex === 0,
        );
        assertDefined(card, "Missing active player's initial hand.");
        if (card.type !== "draw") {
          throw new Error("Expected a draw.");
        }
        const startedState = await liveTables(sql);
        expect(startedState.length).toBeGreaterThan(0);
        const action = {
          tableID,
          action: { type: "play", order: card.order },
        } as const;
        let replacement: Awaited<ReturnType<typeof connect>> | undefined;
        // Holds the table's checkpoint row so that the action's save waits.
        const blocker = await sql.reserve();
        try {
          active.send("action", {
            tableID,
            action: { type: "play", order: 9999 },
          });
          await active.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
          await blocker`SET idle_in_transaction_session_timeout = 0`;
          await blocker`BEGIN`;
          await blocker`SELECT id FROM live_tables WHERE id = ${tableID} FOR UPDATE`;
          active.send("action", action);
          const deadline = performance.now() + 1500;
          for (;;) {
            const rows = await sql`
              SELECT EXISTS(
                SELECT 1 FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND query LIKE 'UPDATE live_tables%'
              ) AS blocked
            `;
            if (
              z.array(z.object({ blocked: z.boolean() })).parse(rows)[0]
                ?.blocked === true
            ) {
              break;
            }
            if (performance.now() > deadline) {
              throw new Error(
                "Rust action did not wait for its checkpoint write.",
              );
            }
            await delay(10);
          }
          expect(
            active.frames.some((message) => message.startsWith("gameAction ")),
          ).toBe(false);
          replacement = await connect(activeIsAlice ? aliceCookie : bobCookie);
          await blocker`ROLLBACK`;
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
          await blocker`ROLLBACK`;
          blocker.release();
        }
        if (activeIsAlice) {
          alice = replacement;
        } else {
          bob = replacement;
        }
        replacement.send("tableReattend", { tableID });
        await replacement.receive(
          "tableStarted",
          SERVER_COMMAND_SCHEMAS.tableStarted,
        );
        await bootstrap(replacement);
        // Resending the applied move is rejected: it is no longer this player's turn.
        replacement.send("action", action);
        await replacement.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
        replacement.send("getGameState", { tableID });
        const onceOnly = await replacement.receive(
          "gameActionList",
          SERVER_COMMAND_SCHEMAS.gameActionList,
        );
        expect(
          onceOnly.actions.filter(
            (event) => event.type === "play" || event.type === "discard",
          ),
        ).toHaveLength(1);
        const acknowledged = await liveTables(sql);
        if (failure === "lost ownership") {
          const stopped = once(state.child, "close");
          // End the server's connection that holds live-table ownership.
          await sql`
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname = current_database() AND application_name LIKE 'hanabi-live-%-ownership'
          `;
          await bounded(stopped, "Rust fail-closed shutdown", 15_000);
          expect(state.child.exitCode).not.toBe(0);
        } else {
          const closed = once(state.child, "close");
          state.child.kill("SIGKILL");
          await bounded(closed, "Rust crash");
        }
        expect(await liveTables(sql)).toEqual(acknowledged);
        state = startProcess(directory);
        address = await bounded(state.ready, "Rust cold recovery readiness");
        const returning = await connect(
          activeIsAlice ? aliceCookie : bobCookie,
        );
        returning.send("tableReattend", { tableID });
        await returning.receive(
          "tableStarted",
          SERVER_COMMAND_SCHEMAS.tableStarted,
        );
        const restored = await bootstrap(returning);
        expect(restored.init.ourPlayerIndex).toBe(0);
        expect(
          restored.history.actions.filter(
            (event) => event.type === "play" || event.type === "discard",
          ),
        ).toHaveLength(1);
        expect(
          restored.history.actions.some(
            (event) =>
              event.type === "draw"
              && event.playerIndex === 0
              && event.rank === undefined,
          ),
        ).toBe(true);
        returning.send("action", action);
        await returning.receive("warning", SERVER_COMMAND_SCHEMAS.warning);
        returning.send("getGameState", { tableID });
        const duplicate = await returning.receive(
          "gameActionList",
          SERVER_COMMAND_SCHEMAS.gameActionList,
        );
        expect(
          duplicate.actions.filter(
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
        await sql.end({ timeout: 3 });
        await database.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    600_000,
  );
});
