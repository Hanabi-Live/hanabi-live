import type * as SharedData from "@hanabi-live/data";
import type { ServerCommandData } from "@hanabi-live/data";
import type { Page } from "@playwright/test";
import { createRequire } from "node:module";
import { expect, test } from "./fixture";

// Playwright loads the CommonJS package through Node rather than Vite.
const shared = createRequire(import.meta.url)(
  "@hanabi-live/data",
) as typeof SharedData;
const { SERVER_COMMAND_SCHEMAS, unpackWSMessage } = shared;

test.use({ cutover: true });
test.skip(() => test.info().project.name !== "go");

function observe(page: Page) {
  const state = {
    init: [] as Array<ServerCommandData["init"]>,
    history: [] as Array<ServerCommandData["gameActionList"]>,
    actions: [] as Array<ServerCommandData["gameAction"]["action"]>,
    loaded: 0,
    errors: [] as string[],
  };
  page.on("pageerror", (error) => {
    state.errors.push(error.message);
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      if (
        typeof frame.payload === "string"
        && frame.payload.startsWith("loaded ")
      ) {
        state.loaded++;
      }
    });
    socket.on("framereceived", (frame) => {
      const message = unpackWSMessage(String(frame.payload));
      if (!message) {
        return;
      }
      const [command, data] = message;
      switch (command) {
        case "init": {
          state.init.push(SERVER_COMMAND_SCHEMAS.init.parse(data));
          break;
        }

        case "gameActionList": {
          state.history.push(SERVER_COMMAND_SCHEMAS.gameActionList.parse(data));
          state.actions = [];
          break;
        }

        case "gameAction": {
          state.actions.push(
            SERVER_COMMAND_SCHEMAS.gameAction.parse(data).action,
          );
          break;
        }
      }
    });
  });
  return state;
}

async function play(page: Page) {
  await page.keyboard.press("a");
  await expect(page.locator("#play-discard-card")).toBeVisible();
  await page.locator("#play-discard-card").fill("1");
  await page.locator("#play-discard-button").click();
}

test(
  "open classic and React-launched games automatically resume across Go-to-Rust cutover",
  { tag: "@audit" },
  async ({ browser, backend, server }) => {
    test.setTimeout(180_000);
    const owner = await browser.newContext();
    const guest = await browser.newContext();
    const a = await owner.newPage();
    const b = await guest.newPage();
    const pages = [a, b];
    const records = pages.map(observe);
    try {
      await a.goto(`${backend}/lobby`);
      await a.locator("#login-username").fill("testCutoverOld");
      await a.locator("#login-password").fill("testCutoverOld");
      await a.locator("#login-button").click();
      await a.locator("#tutorial-no").click();
      await a.locator("#nav-buttons-lobby-create-game").click();
      await expect(a.locator("#createTableName")).not.toHaveValue("");
      await a.locator("#createTableName").fill("Browser cutover");
      await a.locator("#createTableTimed").focus();
      await a.locator("#createTableTimed").press("Space");
      await a.locator("#create-game-submit").click();
      await expect(a.locator("#lobby-pregame")).toBeVisible();

      await b.goto(`${backend}/new`);
      await b.getByLabel("Username", { exact: true }).fill("testCutoverNew");
      await b.getByLabel("Password", { exact: true }).fill("testCutoverNew");
      await b.getByRole("button", { name: "Sign In", exact: true }).click();
      await b
        .locator(".table-card")
        .filter({ hasText: "Browser cutover" })
        .getByRole("button", { name: "Join", exact: true })
        .click();
      await expect(a.locator("#lobby-pregame-player-2")).toBeVisible();
      await expect(a.locator("#nav-buttons-pregame-start")).not.toHaveClass(
        /\bdisabled\b/u,
      );
      await a.locator("#nav-buttons-pregame-start").click();
      await expect
        .poll(() => records.every((record) => record.loaded === 1))
        .toBe(true);
      const first = records.findIndex(
        (record) => record.init.at(-1)?.ourPlayerIndex === 0,
      );
      const active = pages[first];
      if (!active) {
        throw new Error("Missing the first browser player.");
      }
      await play(active);
      await expect
        .poll(() =>
          records.every((record) =>
            record.actions.some(
              (action) => action.type === "turn" && action.num === 1,
            ),
          ),
        )
        .toBe(true);
      const before = records.map((record) => ({
        init: record.init.at(-1),
        actions: [...(record.history.at(-1)?.list ?? []), ...record.actions],
      }));
      const urls = pages.map((page) => page.url());
      await server.cutoverToRust();
      await expect
        .poll(() => records.every((record) => record.loaded >= 2), {
          timeout: 45_000,
        })
        .toBe(true);
      await Promise.all(
        pages.map(async (page, index) => {
          const url = urls[index];
          if (!url) {
            throw new Error("Missing original game URL.");
          }
          await expect(page).toHaveURL(url);
          await expect(page.locator("canvas").first()).toBeVisible();
          expect(records[index]?.init.at(-1)?.ourPlayerIndex).toBe(
            before[index]?.init?.ourPlayerIndex,
          );
          expect(records[index]?.history.at(-1)?.list).toEqual(
            before[index]?.actions,
          );
        }),
      );
      const second = pages[1 - first];
      if (!second) {
        throw new Error("Missing the second browser player.");
      }
      await play(second);
      await expect
        .poll(() =>
          records.every((record) =>
            record.actions.some(
              (action) => action.type === "turn" && action.num === 2,
            ),
          ),
        )
        .toBe(true);
      expect(records.flatMap((record) => record.errors)).toEqual([]);
    } finally {
      await Promise.all([owner.close(), guest.close()]);
    }
  },
);
