import { expect, gameReady, test } from "./fixture";

type GameWindow = typeof globalThis & {
  globals: {
    elements: {
      sharedReplayLeaderLabel: { fire: (event: string) => void } | null;
    };
    state: { replay: { shared: { leader: string } | null } };
  };
};

test("sign in, join, play, return, and recover the new lobby", async ({
  browser,
  backend,
}) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();
  const errors: string[] = [];
  a.on("pageerror", (error) => {
    errors.push(error.message);
  });
  b.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await Promise.all(
    (
      [
        [a, "testLobbyAlice"],
        [b, "testLobbyBob"],
      ] as const
    ).map(async ([page, name]) => {
      await page.goto(`${backend}/new`);
      await page.getByLabel("Username", { exact: true }).fill(name);
      await page.getByLabel("Password", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(page.locator("#lobby-games")).toBeVisible();
    }),
  );
  await a.getByRole("button", { name: "Create a table" }).click();
  await a.getByLabel("Table name", { exact: true }).fill("A good first table");
  await a.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "A good first table" }),
  ).toBeVisible();
  const table = b
    .locator(".table-card")
    .filter({ hasText: "A good first table" });
  await expect(table).toHaveCount(1);
  await b.screenshot({
    path: test.info().outputPath("new-lobby-desktop.png"),
    fullPage: true,
  });
  await table.getByRole("button", { name: "Join", exact: true }).click();
  await expect(a.locator(".seat:not(.empty-seat)")).toHaveCount(2);
  const aReady = gameReady(a);
  const bReady = gameReady(b);
  await a.getByRole("button", { name: "Start game" }).click();
  await Promise.all([aReady, bReady]);
  await expect(a).toHaveURL(/\/game\/\d+(?:#\d+)?$/u);
  await expect(b).toHaveURL(/\/game\/\d+(?:#\d+)?$/u);
  await expect(a.locator("canvas").first()).toBeVisible();
  await a.screenshot({ path: test.info().outputPath("legacy-game.png") });
  await a.keyboard.press("Alt+l");
  await expect(a).toHaveURL(/\/new$/u);
  await expect(a.locator("#lobby-games")).toBeVisible();
  await alice.setOffline(true);
  await expect(a.getByText("Reconnecting...", { exact: true })).toBeVisible();
  await alice.setOffline(false);
  await expect(a.getByText("Connected", { exact: true })).toBeVisible();
  await expect(a.locator("#lobby-games")).toBeVisible();
  await expect(
    a.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  const resumed = gameReady(a);
  await a.getByRole("button", { name: "Resume", exact: true }).click();
  await resumed;
  await expect(a.locator("canvas").first()).toBeVisible();
  await a.keyboard.press("Alt+c");
  await a.locator("#game-chat-input").fill("/terminate");
  await a.locator("#game-chat-input").press("Enter");
  await expect(a).toHaveURL(/\/shared-replay\/\d+(?:#\d+)?$/u);
  await a.keyboard.press("Escape");
  await a.evaluate(() => {
    const crown = (globalThis as GameWindow).globals.elements
      .sharedReplayLeaderLabel;
    if (crown === null) {
      throw new Error("Missing replay crown");
    }
    crown.fire("click");
  });
  const leaderDialog = a.locator("#set-leader-modal");
  await expect(
    leaderDialog.getByRole("button", { name: "testLobbyBob", exact: true }),
  ).toBeVisible();
  await expect(
    leaderDialog.getByRole("button", { name: "testLobbyAlice", exact: true }),
  ).toHaveCount(0);
  await leaderDialog
    .getByRole("button", { name: "testLobbyBob", exact: true })
    .click();
  await a.waitForFunction(
    () =>
      (globalThis as GameWindow).globals.state.replay.shared?.leader
      === "testLobbyBob",
  );
  await a.keyboard.press("Alt+l");
  await expect(a).toHaveURL(/\/new$/u);
  await a.getByRole("link", { name: "History", exact: true }).click();
  await expect(a.locator(".history-card")).toHaveCount(1);
  const replayReady = gameReady(a);
  await a
    .locator(".history-card")
    .getByRole("button", { name: "Replay", exact: true })
    .click();
  await replayReady;
  await expect(a).toHaveURL(/\/replay\/\d+(?:#\d+)?$/u);
  await expect(a.locator("canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
  await alice.close();
  await bob.close();
});
