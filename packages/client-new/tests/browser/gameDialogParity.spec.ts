import { expect, test } from "./fixture";

test.use({ actionTimeout: 10_000 });

for (const client of ["classic", "new"] as const) {
  test(
    `create options preserve classic constraints (${client})`,
    { tag: "@audit" },
    async ({ page, backend }) => {
      const name = `testOpt${client}`;
      if (client === "classic") {
        await page.goto(`${backend}/lobby`);
        await page.locator("#login-username").fill(name);
        await page.locator("#login-password").fill(name);
        await page.locator("#login-button").click();
        await page.locator("#tutorial-no").click();
        await page.locator("#nav-buttons-lobby-create-game").click();
        await expect(page.locator("#createTableName")).toHaveValue(
          `${name}'s table`,
        );
        await page.locator("#create-game-show-extra-options").click();
      } else {
        await page.goto(`${backend}/new`);
        await page.getByLabel("Username", { exact: true }).fill(name);
        await page.getByLabel("Password", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: "Sign In", exact: true })
          .click();
        await page.getByRole("button", { name: "Create a table" }).click();
        await page.getByText("Show Extra Options", { exact: true }).click();
      }
      const speedrun =
        client === "classic"
          ? page.locator("#createTableSpeedrun")
          : page.getByRole("checkbox", { name: "Speedrun", exact: true });
      const timed = page.locator("#create-game-timed-row");
      const extra =
        client === "classic"
          ? page.locator("#createTableOneExtraCard")
          : page.getByRole("checkbox", { name: /^One extra card/u });
      const less =
        client === "classic"
          ? page.locator("#createTableOneLessCard")
          : page.getByRole("checkbox", { name: /^One less card/u });
      await speedrun.press("Space");
      await expect(timed).toBeHidden();
      await speedrun.press("Space");
      await expect(timed).toBeVisible();
      await extra.press("Space");
      await expect(extra).toBeChecked();
      await expect(less).toBeDisabled();
      await extra.press("Space");
      await expect(less).toBeEnabled();
      await less.press("Space");
      await expect(less).toBeChecked();
      await expect(extra).toBeDisabled();
      await less.press("Space");
      await expect(extra).toBeEnabled();
    },
  );
}

test(
  "both clients share the remembered table creation password",
  { tag: "@audit" },
  async ({ page, backend }) => {
    await page.goto(`${backend}/lobby`);
    await page.locator("#login-username").fill("testPassSave");
    await page.locator("#login-password").fill("testPassSave");
    await page.locator("#login-button").click();
    await page.locator("#tutorial-no").click();
    await page.locator("#nav-buttons-lobby-create-game").click();
    await expect(page.locator("#createTableName")).toHaveValue(
      "testPassSave's table",
    );
    const passwordType = await page
      .locator("#createTablePassword")
      .getAttribute("type");
    await page.locator("#createTablePassword").fill("local-audit-pass");
    await page.locator("#create-game-submit").click();
    await expect(page.locator("#lobby-pregame")).toBeVisible();
    await page.locator("#nav-buttons-pregame-leave").click();
    await expect(page).toHaveURL(`${backend}/lobby`);
    await page.goto(`${backend}/new`);
    await page.getByRole("button", { name: "Create a table" }).click();
    const password = page.getByLabel("Table password", { exact: true });
    await expect(password).toHaveValue("local-audit-pass");
    await expect(password).toHaveAttribute("type", passwordType ?? "");
    await password.fill("new-audit-pass");
    await page
      .getByRole("button", { name: "Create table", exact: true })
      .click();
    await expect(page.locator("#lobby-pregame")).toBeVisible();
    await page
      .getByRole("button", { name: "Leave table", exact: true })
      .click();
    await expect(page).toHaveURL(`${backend}/new`);
    await page.goto(`${backend}/lobby`);
    await page.locator("#tutorial-no").click();
    await page.locator("#nav-buttons-lobby-create-game").click();
    await expect(page.locator("#createTableName")).toHaveValue(
      "testPassSave's table",
    );
    await expect(page.locator("#createTablePassword")).toHaveValue(
      "new-audit-pass",
    );
  },
);
