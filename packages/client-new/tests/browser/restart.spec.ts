import type { Page } from "@playwright/test";
import { expect, gameReady, test } from "./fixture";

test.use({ restartLoad: true });
test.skip(() => test.info().project.name !== "rust");

type GameWindow = typeof globalThis & {
  globals: {
    metadata: { ourPlayerIndex: number };
    lobby: {
      tableID: number;
      conn: {
        ws: WebSocket;
        send: (command: string, data: object) => void;
      };
    };
    state: {
      ongoingGame: {
        turn: { currentPlayerIndex: number };
        hands: number[][];
        deck: Array<{ rank: number | null }>;
      };
    };
  };
};

async function measureAcceptedAction(page: Page) {
  return await page.evaluate(
    async () =>
      await new Promise<{ elapsed: number; turn: number }>(
        (resolve, reject) => {
          const { globals } = globalThis as GameWindow;
          const game = globals.state.ongoingGame;
          const before = game.turn.currentPlayerIndex;
          if (globals.metadata.ourPlayerIndex !== before) {
            throw new Error(
              "Recovery changed the player whose action was prepared.",
            );
          }
          const target = (before + 1) % game.hands.length;
          const order = game.hands[target]?.[0];
          const value = order === undefined ? null : game.deck[order]?.rank;
          if (value === null || value === undefined) {
            throw new Error("Missing visible card.");
          }
          const socket = globals.lobby.conn.ws;
          const timer = globalThis.setTimeout(() => {
            cleanup();
            reject(
              new Error(
                "The restarted server did not acknowledge the probe action.",
              ),
            );
          }, 10_000);
          function cleanup() {
            globalThis.clearTimeout(timer);
            socket.removeEventListener("message", accepted);
          }
          const started = globalThis.performance.now();
          function accepted(event: MessageEvent<unknown>) {
            const turn = globals.state.ongoingGame.turn.currentPlayerIndex;
            if (
              typeof event.data === "string"
              && event.data.startsWith("gameAction ")
              && turn !== before
            ) {
              const elapsed = globalThis.performance.now() - started;
              cleanup();
              resolve({ elapsed, turn });
            }
          }
          // The connection's earlier message listener applies authoritative game state first.
          socket.addEventListener("message", accepted);
          try {
            globals.lobby.conn.send("action", {
              tableID: globals.lobby.tableID,
              type: 3,
              target,
              value,
            });
          } catch (error) {
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
      ),
  );
}

async function login(page: Page, url: string, name: string) {
  await page.goto(`${url}/new`);
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#lobby-games")).toBeVisible();
}

test("restart restores playable game state before large-archive lobby reads @restart", async ({
  browser,
  server,
}, info) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(
    Array.from({ length: 10 }, async () => await browser.newContext()),
  );
  const pages = await Promise.all(
    contexts.map(async (context) => await context.newPage()),
  );
  const errors: string[] = [];
  const connections = new Map<Page, number>();
  for (const page of pages) {
    page.on("websocket", () => {
      connections.set(page, (connections.get(page) ?? 0) + 1);
    });
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
  }
  try {
    await Promise.all(
      pages.map(async (page, i) => {
        await login(
          page,
          server.url,
          `testRestart${String.fromCodePoint(65 + i)}`,
        );
      }),
    );
    await server.seedHistories();
    const [a, b] = pages;
    if (!a || !b) {
      throw new Error("Missing game browsers.");
    }
    await a.getByRole("button", { name: "Create a table" }).click();
    await a.getByLabel("Table name", { exact: true }).fill("Restart latency");
    await a.getByRole("button", { name: "Create table", exact: true }).click();
    await b
      .locator(".table-card")
      .filter({ hasText: "Restart latency" })
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await expect(a.locator(".seat:not(.empty-seat)")).toHaveCount(2);
    const ready = [gameReady(a), gameReady(b)];
    await a.getByRole("button", { name: "Start game" }).click();
    await Promise.all(ready);
    const canvases = await Promise.all(
      [a, b].map(
        async (page) => await page.locator("canvas").first().elementHandle(),
      ),
    );
    const samples: number[] = [];
    const phases: Array<{
      loaded: number;
      action: number;
      controller: number;
    }> = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const connectionsBefore = pages.map((page) => connections.get(page) ?? 0);
      // Select the player before timing so controller round trips do not inflate recovery latency.
      // eslint-disable-next-line no-await-in-loop
      const ownerTurn = await a.evaluate(() => {
        const { globals } = globalThis as GameWindow;
        return (
          globals.metadata.ourPlayerIndex
          === globals.state.ongoingGame.turn.currentPlayerIndex
        );
      });
      const actor = ownerTurn ? a : b;
      const resumed = [gameReady(a), gameReady(b)];
      const start = performance.now();
      // eslint-disable-next-line no-await-in-loop
      await server.restart();
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(resumed);
      const loaded = performance.now() - start;
      // Exclude controller round trips and trace snapshots between readiness and the probe. Action
      // timing begins at send and ends after the authoritative turn update in the browser.
      // eslint-disable-next-line no-await-in-loop
      const measurement = await measureAcceptedAction(actor);
      samples.push(loaded + measurement.elapsed);
      phases.push({
        loaded,
        action: measurement.elapsed,
        controller: performance.now() - start,
      });
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        [a, b].map(async (page) => {
          await page.waitForFunction(
            (turn) =>
              (globalThis as GameWindow).globals.state.ongoingGame.turn
                .currentPlayerIndex === turn,
            measurement.turn,
          );
        }),
      );
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        pages.slice(2).map(async (page, index) => {
          await expect
            .poll(() => connections.get(page) ?? 0)
            .toBeGreaterThan(connectionsBefore[index + 2] ?? 0);
          await expect(
            page.getByText("Connected", { exact: true }),
          ).toBeVisible();
        }),
      );
    }
    for (const [i, page] of [a, b].entries()) {
      // eslint-disable-next-line no-await-in-loop
      expect(await canvases[i]?.evaluate((canvas) => canvas.isConnected)).toBe(
        true,
      );
      expect(page.url()).toContain("/game/");
    }
    const p95 = Math.max(...samples);
    console.info(
      "Restart-to-accepted-action milliseconds:",
      JSON.stringify({ samples, p95, phases }),
    );
    await info.attach("restart-latency", {
      body: JSON.stringify({ archiveGames: 2_000_000, samples, p95, phases }),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
    expect(
      p95,
      `restart-to-accepted-action samples: ${samples.join(", ")}`,
    ).toBeLessThan(1000);
  } finally {
    await Promise.all(
      contexts.map(async (context) => {
        await context.close();
      }),
    );
  }
});
