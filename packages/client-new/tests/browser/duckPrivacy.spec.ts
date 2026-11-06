import type * as SharedData from "@hanabi-live/data";
import type { Page } from "@playwright/test";
import { createRequire } from "node:module";
import { expect, gameReady, test } from "./fixture";

const { SERVER_COMMAND_SCHEMAS } = createRequire(import.meta.url)(
  "@hanabi-live/data",
) as typeof SharedData;

type GameWindow = typeof globalThis & {
  copiedText: string;
  globals: {
    metadata: { ourPlayerIndex: number };
    lobby: {
      tableID: number;
      conn: { send: (command: string, data: object) => void };
    };
    state: {
      finished: boolean;
      ongoingGame: {
        turn: { currentPlayerIndex: number };
        hands: number[][];
        deck: Array<{ rank: number | null }>;
        clues: Array<{ type: number; value: unknown }>;
      };
      replay: {
        actions: Array<{
          type: string;
          clue?: { type: number; value: number };
        }>;
      };
    };
  };
};

function capture(page: Page) {
  const live: Array<{ type: number; value: number }> = [];
  const histories: Array<Array<{ type: number; value: number }>> = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const text = payload.toString();
      if (text.startsWith("gameAction ")) {
        const data = SERVER_COMMAND_SCHEMAS.gameAction.parse(
          JSON.parse(text.slice("gameAction ".length)),
        );
        if (data.action.type === "clue") {
          live.push(data.action.clue);
        }
      } else if (text.startsWith("gameActionList ")) {
        const data = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
          JSON.parse(text.slice("gameActionList ".length)),
        );
        histories.push(
          data.list.flatMap((action) =>
            action.type === "clue" ? [action.clue] : [],
          ),
        );
      }
    });
  });
  return { live, histories };
}

test("Duck clues stay hidden on the wire and render through reconnect and completed replay", async ({
  browser,
  backend,
}) => {
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  try {
    const a = await owner.newPage();
    const b = await guest.newPage();
    const messages = [capture(a), capture(b)];
    const errors: string[] = [];
    for (const page of [a, b]) {
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
    }
    await Promise.all(
      ([a, b] as const).map(async (page, index) => {
        const name = index === 0 ? "testDuckAlice" : "testDuckBob";
        await page.goto(`${backend}/new`);
        await page.getByLabel("Username", { exact: true }).fill(name);
        await page.getByLabel("Password", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: "Sign In", exact: true })
          .click();
        await expect(page.locator("#lobby-games")).toBeVisible();
      }),
    );
    await a.getByRole("button", { name: "Create a table" }).click();
    await a.getByLabel("Table name", { exact: true }).fill("Duck privacy");
    await a.getByLabel("Variant", { exact: true }).selectOption("custom");
    await a.getByLabel("Variant", { exact: true }).fill("Duck (5 Suits)");
    await a.getByRole("button", { name: "Create table", exact: true }).click();
    await b
      .locator(".table-card")
      .filter({ hasText: "Duck privacy" })
      .getByRole("button", { name: "Join", exact: true })
      .click();
    await expect(a.locator(".seat:not(.empty-seat)")).toHaveCount(2);
    const ready = [gameReady(a), gameReady(b)];
    await a.getByRole("button", { name: "Start game" }).click();
    await Promise.all(ready);
    const aTurn = await a.evaluate(() => {
      const { globals } = globalThis as GameWindow;
      return (
        globals.metadata.ourPlayerIndex
        === globals.state.ongoingGame.turn.currentPlayerIndex
      );
    });
    const rank = await (aTurn ? a : b).evaluate(() => {
      const { globals } = globalThis as GameWindow;
      const game = globals.state.ongoingGame;
      const target = (game.turn.currentPlayerIndex + 1) % game.hands.length;
      const order = game.hands[target]?.[0];
      if (order === undefined) {
        throw new Error("Missing target card");
      }
      const value = game.deck[order]?.rank;
      if (value === undefined || value === null) {
        throw new Error("Missing visible rank");
      }
      globals.lobby.conn.send("action", {
        tableID: globals.lobby.tableID,
        type: 3,
        target,
        value,
      });
      return value;
    });
    await Promise.all(
      [a, b].map(async (page, index) => {
        await expect
          .poll(() => messages[index]?.live)
          .toEqual([{ type: -1, value: -1 }]);
        await expect
          .poll(
            async () =>
              await page.evaluate(
                () =>
                  (globalThis as GameWindow).globals.state.ongoingGame.clues.at(
                    -1,
                  )?.type,
              ),
          )
          .toBe(-1);
      }),
    );
    const reloaded = gameReady(b);
    await b.reload();
    await reloaded;
    await expect
      .poll(() => messages[1]?.histories.at(-1))
      .toEqual([{ type: -1, value: -1 }]);
    await a.evaluate(() => {
      const { globals } = globalThis as GameWindow;
      globals.lobby.conn.send("tableTerminate", {
        tableID: globals.lobby.tableID,
      });
    });
    await Promise.all(
      [a, b].map(async (page) => {
        await expect
          .poll(
            async () =>
              await page.evaluate(() => {
                const { globals } = globalThis as GameWindow;
                return {
                  finished: globals.state.finished,
                  clues: globals.state.replay.actions
                    .filter((action) => action.type === "clue")
                    .map((action) => action.clue),
                };
              }),
          )
          .toEqual({ finished: true, clues: [{ type: 1, value: rank }] });
      }),
    );
    await a.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            await Promise.resolve();
            (globalThis as GameWindow).copiedText = text;
          },
        },
      });
    });
    await a.keyboard.press("Alt+c");
    await a.locator("#game-chat-input").fill("/copy");
    await a.locator("#game-chat-input").press("Enter");
    await expect
      .poll(
        async () =>
          await a.evaluate(() => (globalThis as GameWindow).copiedText),
      )
      .toContain("/shared-replay-json/");
    await a.getByRole("button", { name: "here", exact: true }).click();
    const copied: unknown = JSON.parse(
      await a.evaluate(() => (globalThis as GameWindow).copiedText),
    );
    expect(copied).toMatchObject({ actions: [{ type: 3, value: rank }] });
    expect(errors).toEqual([]);
  } finally {
    await owner.close();
    await guest.close();
  }
});
