import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";

type LobbyWindow = typeof globalThis & {
  globals2: {
    friends: string[];
    conn: { send: (command: string, data: object) => void };
  };
};
async function login(page: Page, backend: string, name: string) {
  await page.goto(`${backend}/new`);
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#lobby-games")).toBeVisible();
}

for (const lobby of ["lobby", "new"]) {
  test(`${lobby} requests personal history on demand without offering friends history`, async ({
    browser,
    backend,
  }) => {
    const context = await browser.newContext();
    const friendContext = await browser.newContext();
    try {
      const page = await context.newPage();
      const introduction = page.getByText(
        "I already know how everything works.",
        { exact: true },
      );
      await page.addLocatorHandler(introduction, async () => {
        await introduction.click();
      });
      const friend = await friendContext.newPage();
      await login(friend, backend, "test2");
      await login(page, backend, "test");
      await page.goto(`${backend}/lobby`);
      await expect(page.locator("#lobby")).toBeVisible();
      await page.evaluate(() => {
        (globalThis as LobbyWindow).globals2.conn.send("chatFriend", {
          name: "test2",
          room: "lobby",
        });
      });
      await page.waitForFunction(() =>
        (globalThis as LobbyWindow).globals2.friends.includes("test2"),
      );
      const history: string[] = [];
      const requests: string[] = [];
      let ready = 0;
      page.on("websocket", (socket) => {
        socket.on("framesent", ({ payload }) => {
          const command = payload.toString().split(" ", 1)[0];
          if (command === "historyGet" || command === "historyFriendsGet") {
            requests.push(command);
          }
        });
        socket.on("framereceived", ({ payload }) => {
          const text = payload.toString();
          if (
            text.startsWith("gameHistory ")
            || text.startsWith("gameHistoryFriends ")
          ) {
            history.push(
              text.startsWith("gameHistory ")
                ? "gameHistory"
                : "gameHistoryFriends",
            );
          }
          if (text.startsWith("lobbyStatus ") && text.includes('"ready"')) {
            ready++;
          }
        });
      });
      await page.goto(`${backend}/${lobby}`);
      await expect.poll(() => ready).toBe(1);
      expect(requests).toEqual([]);
      expect(history).toEqual([]);
      await page.reload();
      await expect.poll(() => ready).toBe(2);
      expect(requests).toEqual([]);
      expect(history).toEqual([]);
      if (lobby === "lobby") {
        await page.locator("#nav-buttons-lobby-history").click();
      } else {
        await page.getByRole("link", { name: "History", exact: true }).click();
      }
      await expect.poll(() => history).toEqual(["gameHistory"]);
      expect(requests).toEqual(["historyGet"]);
      await expect(
        page.getByText("Show History of Friends", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator("#nav-buttons-history-show-friends"),
      ).toHaveCount(0);
      await page.reload();
      if (lobby === "lobby") {
        await page.locator("#nav-buttons-lobby-history").click();
      }
      await expect.poll(() => history).toEqual(["gameHistory", "gameHistory"]);
      expect(requests).toEqual(["historyGet", "historyGet"]);
      if (lobby === "new") {
        await context.setOffline(true);
        await expect(
          page.getByText("Reconnecting...", { exact: true }),
        ).toBeVisible();
        await context.setOffline(false);
        await expect
          .poll(() => history)
          .toEqual(["gameHistory", "gameHistory", "gameHistory"]);
        expect(requests).toEqual(["historyGet", "historyGet", "historyGet"]);
      }
    } finally {
      await context.close();
      await friendContext.close();
    }
  });
}
