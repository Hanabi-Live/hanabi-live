import { expect, test } from "./fixture";

for (const theme of ["light", "dark"] as const) {
  test(`React lobby uses the classic layout, palette, and typography (${theme})`, async ({
    page,
    backend,
  }) => {
    await page.addInitScript((value: string) => {
      localStorage.setItem("darkMode", String(value === "dark"));
    }, theme);
    await page.goto(`${backend}/lobby`);
    await page.locator("#login-username").fill(`testStyle${theme}`);
    await page.locator("#login-password").fill(`testStyle${theme}`);
    await page.locator("#login-button").click();
    await page.locator("#tutorial-no").click();
    await expect(page.locator("#lobby")).toBeVisible();
    await page.evaluate(async () => await globalThis.document.fonts.ready);
    await page.screenshot({
      path: test.info().outputPath("classic-lobby.png"),
    });
    const reference = await page.evaluate(() => {
      const elements = [
        "#header",
        "#lobby-games",
        "#lobby-chat",
        "#lobby-online-users .box",
      ];
      return elements.map((selector) => {
        const element = globalThis.document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing classic element: ${selector}`);
        }
        const { x, y, width, height } = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);
        return {
          x,
          y,
          width,
          height,
          background: style.backgroundColor,
          font: style.fontFamily,
        };
      });
    });
    await page.locator("#nav-buttons-lobby-create-game").click();
    await expect(page.locator("#createTableName")).not.toHaveValue("");
    await page.locator("#createTableName").fill("Style reference");
    await page.screenshot({
      path: test.info().outputPath("classic-create.png"),
    });
    await page.locator("#create-game-submit").click();
    await expect(page.locator("#lobby-pregame-player-1")).toContainText(
      "Total games:",
    );
    await page.screenshot({
      path: test.info().outputPath("classic-pregame.png"),
    });
    const headings = await page
      .locator("#lobby-games-table th")
      .allTextContents();
    await page.locator("#nav-buttons-pregame-leave").click();
    await expect(page.locator("#lobby-games-table-tbody")).not.toContainText(
      "Style reference",
    );
    await page.goto(`${backend}/new`);
    await expect(page.locator("#lobby-games")).toBeVisible();
    await page.evaluate(async () => await globalThis.document.fonts.ready);
    await page.screenshot({
      path: test.info().outputPath("react-classic-lobby.png"),
    });
    const actual = await page.evaluate(() =>
      [
        "#header",
        "#lobby-games",
        "#lobby-chat",
        "#lobby-online-users .box",
      ].map((selector) => {
        const element = globalThis.document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing React element: ${selector}`);
        }
        const { x, y, width, height } = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);
        return {
          x,
          y,
          width,
          height,
          background: style.backgroundColor,
          font: style.fontFamily,
        };
      }),
    );
    // Grunt and Vite round fractional column widths differently; compare rendered pixels.
    expect(
      actual.map((item) => ({ ...item, width: Math.round(item.width) })),
    ).toEqual(
      reference.map((item) => ({ ...item, width: Math.round(item.width) })),
    );
    expect(await page.evaluate(() => "jQuery" in globalThis)).toBe(false);
    await page.getByRole("button", { name: "Create a table" }).click();
    await page
      .getByLabel("Table name", { exact: true })
      .fill("Style reference");
    await page.screenshot({
      path: test.info().outputPath("react-classic-create.png"),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create table", exact: true })
      .click();
    await expect(page.locator(".seat-grid")).toContainText("Total games:");
    await expect(
      page.getByRole("textbox", { name: "Pre-game chat message", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Chat message", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("react-classic-pregame.png"),
    });
    await page.getByRole("button", { name: "Back to tables" }).click();
    await expect(page.locator("#lobby-games-table")).toContainText(
      "Style reference",
    );
    expect(
      await page.locator("#lobby-games-table th").allTextContents(),
    ).toEqual(headings);
    await page.screenshot({
      path: test.info().outputPath("react-classic-tables.png"),
    });
    await page
      .locator(".table-card")
      .filter({ hasText: "Style reference" })
      .getByRole("button", { name: "Resume", exact: true })
      .click();
    await page.getByRole("button", { name: "Leave table" }).click();
    await expect(
      page.locator(".table-card").filter({ hasText: "Style reference" }),
    ).toHaveCount(0);
  });
}
