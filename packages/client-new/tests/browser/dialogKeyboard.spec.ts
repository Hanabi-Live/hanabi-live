import { VARIANT_NAMES } from "@hanabi-live/game";
import { expect, test } from "./fixture";

test.use({ actionTimeout: 10_000 });

for (const client of ["classic", "new"] as const) {
  test(
    `create dialog keyboard navigation and canceled preferences (${client})`,
    { tag: "@audit" },
    async ({ page, backend }) => {
      const name = `tKey${client}`;
      await page.goto(`${backend}/${client === "classic" ? "lobby" : "new"}`);
      if (client === "classic") {
        await page.locator("#login-username").fill(name);
        await page.locator("#login-password").fill(name);
        await page.locator("#login-button").click();
        await page.locator("#tutorial-no").click();
      } else {
        await page.getByLabel("Username", { exact: true }).fill(name);
        await page.getByLabel("Password", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: "Sign In", exact: true })
          .click();
      }
      const opener =
        client === "classic"
          ? page.locator("#nav-buttons-lobby-create-game")
          : page.getByRole("button", { name: "Create a table" });
      if (client === "classic") {
        await opener.click();
      } else {
        await opener.focus();
        await page.keyboard.press("Enter");
      }
      const dialog = page.locator("#create-game-modal");
      const variant =
        client === "classic"
          ? page.locator("#create-game-variant-dropdown1")
          : page.getByLabel("Variant", { exact: true });
      await expect(variant).toBeFocused();
      await variant.selectOption("6 Suits");
      await page.keyboard.press("Tab");
      await expect(dialog.locator('a[href$="/variants.md"]')).toBeFocused();
      await page.keyboard.press("Tab");
      const timed =
        client === "classic"
          ? page.locator("#createTableTimed")
          : page.getByLabel("Timed game", { exact: true });
      await expect(timed).toBeFocused();
      await page.keyboard.press("Space");
      await expect(timed).toBeChecked();
      await page.keyboard.press("Tab");
      const base =
        client === "classic"
          ? page.locator("#createTableTimeBaseMinutes")
          : page.getByLabel("Base time (minutes)");
      await expect(base).toBeFocused();
      await base.fill("3");
      await page.keyboard.press("Tab");
      const seconds =
        client === "classic"
          ? page.locator("#createTableTimePerTurnSeconds")
          : page.getByLabel("Seconds per turn");
      await expect(seconds).toBeFocused();
      await seconds.fill("25");
      await page.keyboard.press("Tab");
      const maximum =
        client === "classic"
          ? page.locator("#createTableMaxPlayers")
          : page.getByLabel("Maximum players");
      await maximum.fill("1");
      await maximum.press("Tab");
      await expect.soft(maximum).toHaveValue("5");
      await dialog.getByText("Show Extra Options", { exact: true }).click();
      const cycle =
        client === "classic"
          ? page.locator("#createTableCardCycle")
          : page.getByRole("checkbox", { name: "Card cycling", exact: true });
      await cycle.press("Space");
      await expect(cycle).toBeChecked();
      const extra =
        client === "classic"
          ? page.locator("#createTableOneExtraCard")
          : page.getByRole("checkbox", { name: "One extra card", exact: true });
      await extra.press("Space");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await opener.click();
      await expect(variant).toHaveValue("6 Suits");
      await expect(timed).toBeChecked();
      await expect(base).toHaveValue("3");
      await expect(seconds).toHaveValue("25");
      await expect(cycle).toBeChecked();
      await expect(extra).toBeChecked();
      if (client === "new") {
        await variant.selectOption("custom");
        await variant.fill("not a variant");
        const dice = page.getByRole("button", {
          name: "Choose a random variant",
        });
        await dice.focus();
        await page.keyboard.press("Enter");
        await expect(variant).not.toHaveValue("not a variant");
        expect(VARIANT_NAMES.includes(await variant.inputValue())).toBe(true);
        await expect(dialog).toBeVisible();
        await variant.fill("not a variant");
        await dice.click();
        await expect(variant).not.toHaveValue("not a variant");
        expect(VARIANT_NAMES.includes(await variant.inputValue())).toBe(true);
      }
    },
  );
}

test(
  "Settings Escape returns focus and replay keyboard selections persist",
  { tag: "@audit" },
  async ({ page, backend }) => {
    await page.goto(`${backend}/new`);
    await page.getByLabel("Username", { exact: true }).fill("tReplayKeys");
    await page.getByLabel("Password", { exact: true }).fill("tReplayKeys");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    const settings = page.getByRole("link", { name: "Settings", exact: true });
    await settings.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Desktop notifications", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(settings).toBeFocused();
    const replays = page.getByRole("link", { name: "Replays", exact: true });
    await replays.click();
    await expect(page.getByLabel("Game ID or replay link")).toBeFocused();
    await page.locator('label[for="replay-source-json"]').click();
    const json = page.getByLabel("Replay JSON", { exact: true });
    await expect(json).toBeFocused();
    const replay = '{"players":["Alice","Bob"],"seed":"p2v0s1"}';
    await json.fill(replay);
    await page.locator('label[for="replay-visibility-shared"]').click();
    await page.getByRole("button", { name: "Open replay" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/shared-replay\/\d+/u);
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+l");
    await expect(page).toHaveURL(`${backend}/new`);
    await replays.click();
    await expect(
      page.getByRole("radio", { name: "JSON Data", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "Shared", exact: true }),
    ).toBeChecked();
    await expect(json).toHaveValue(replay);
    await expect(json).toBeFocused();
    expect(
      await json.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([0, replay.length]);
  },
);
