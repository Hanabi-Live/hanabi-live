/* eslint-disable no-await-in-loop -- Pointer positions, viewport sizes, and game transitions must be exercised sequentially. */
import type { Locator, Page } from "@playwright/test";
import { expect, setClassicCheckbox, test } from "./fixture";

test.use({ actionTimeout: 10_000 });

async function login(page: Page, backend: string, name: string) {
  await page.goto(`${backend}/new`);
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#lobby-games")).toBeVisible();
}

async function classic(page: Page, backend: string) {
  await page.evaluate(() => {
    globalThis.sessionStorage.removeItem("hanabi-lobby");
  });
  await page.goto(`${backend}/lobby`);
  await expect(
    page
      .locator("#tutorial-no")
      .or(page.locator("#lobby"))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  if (await page.locator("#tutorial-no").isVisible()) {
    await page.locator("#tutorial-no").click();
  }
  await expect(page.locator("#lobby")).toBeVisible();
}

async function color(locator: Locator) {
  return await locator.evaluate((element) => getComputedStyle(element).color);
}

async function hitCursor(page: Page, cell: Locator, fraction: number) {
  const box = await cell.boundingBox();
  if (!box) {
    throw new Error("Missing table cell bounds.");
  }
  const point = { x: box.x + box.width / 2, y: box.y + box.height * fraction };
  await page.mouse.move(point.x, point.y);
  const cursor = await page.evaluate(({ x, y }) => {
    const element = globalThis.document.elementFromPoint(x, y);
    if (!element) {
      throw new Error("Missing hit target.");
    }
    return globalThis.getComputedStyle(element).cursor;
  }, point);
  return { point, cursor };
}

for (const theme of ["light", "dark"] as const) {
  test(
    `classic-derived identity, cursor, password and option parity (${theme})`,
    { tag: "@audit" },
    async ({ browser, backend }, info) => {
      const owner = await browser.newContext();
      const viewer = await browser.newContext();
      try {
        for (const context of [owner, viewer]) {
          await context.addInitScript((dark) => {
            localStorage.setItem("darkMode", String(dark));
          }, theme === "dark");
        }
        const a = await owner.newPage();
        const b = await viewer.newPage();
        const ownerName = `testPO${theme}`;
        const viewerName = `testPV${theme}`;
        await login(a, backend, ownerName);
        await login(b, backend, viewerName);
        await a.getByRole("button", { name: "Create a table" }).click();
        await a
          .getByLabel("Table name", { exact: true })
          .fill(`Parity ${theme}`);
        await a.getByLabel("Table password", { exact: true }).fill("parity");
        await setClassicCheckbox(a.getByLabel("Timed game", { exact: true }));
        await a.getByLabel("Base time (minutes)").fill("2");
        await a.getByLabel("Seconds per turn").fill("20");
        await a.getByText("Show Extra Options", { exact: true }).click();
        await setClassicCheckbox(
          a.getByRole("checkbox", { name: /^Characters/u }),
        );
        await a
          .getByRole("button", { name: "Create table", exact: true })
          .click();
        await expect(a.locator("#lobby-pregame")).toBeVisible();
        await classic(b, backend);
        await b.locator("#lobby-chat-input").fill(`/friend ${ownerName}`);
        await b.locator("#lobby-chat-input").press("Enter");
        const oldRow = b
          .locator("#lobby-games-table tbody tr")
          .filter({ hasText: `Parity ${theme}` });
        await expect(oldRow.locator(".friend")).toHaveCount(1);
        const timer = await oldRow.locator("td").nth(3).innerText();
        const reference = {
          self: await color(b.locator("#lobby-users-table .name-me")),
          friend: await color(oldRow.locator(".friend")),
          options: await oldRow
            .locator("td")
            .nth(3)
            .locator("i")
            .evaluateAll((icons: readonly Element[]) =>
              icons.map((icon) =>
                [...icon.classList].filter((name) => name.startsWith("fa-")),
              ),
            ),
          timer: timer.trim(),
          cursors: [] as string[],
        };
        for (const fraction of [0.1, 0.5, 0.9]) {
          const { cursor } = await hitCursor(
            b,
            oldRow.locator("td").last(),
            fraction,
          );
          reference.cursors.push(cursor);
        }
        await info.attach(`classic-table-${theme}`, {
          body: await oldRow.screenshot(),
          contentType: "image/png",
        });
        await oldRow.locator("td").first().click();
        await expect(b.locator("#password-modal")).toBeVisible();
        const passwordBounds = await b.locator("#password-modal").boundingBox();
        if (passwordBounds === null) {
          throw new Error("Missing classic password dialog.");
        }
        const passwordTitle = await b.locator("#password-modal h3").innerText();
        const passwordType = await b
          .locator("#password-modal-password")
          .getAttribute("type");
        await expect(b.locator("#password-modal-password")).toBeFocused();
        await b.locator("#password-modal-cancel").click();
        await b.goto(`${backend}/new`);
        const row = b
          .locator(".table-card")
          .filter({ hasText: `Parity ${theme}` });
        await expect(row).toBeVisible();
        expect
          .soft(
            await color(b.locator("#lobby-users-table .name-me")),
            "self color",
          )
          .toBe(reference.self);
        expect
          .soft(await color(row.locator(".friend")), "friend color")
          .toBe(reference.friend);
        expect
          .soft(
            await row
              .locator("td")
              .nth(3)
              .locator("i")
              .evaluateAll((icons: readonly Element[]) =>
                icons.map((icon) =>
                  [...icon.classList].filter((name) => name.startsWith("fa-")),
                ),
              ),
            "option icons",
          )
          .toEqual(reference.options);
        const actualTimer = await row.locator("td").nth(3).innerText();
        expect.soft(actualTimer.trim(), "visible timer").toBe(reference.timer);
        for (const [index, fraction] of [0.1, 0.5, 0.9].entries()) {
          const { cursor } = await hitCursor(
            b,
            row.locator("td").last(),
            fraction,
          );
          expect
            .soft(cursor, `spectator cursor at ${fraction}`)
            .toBe(reference.cursors[index]);
        }
        await info.attach(`new-table-${theme}`, {
          body: await row.screenshot(),
          contentType: "image/png",
        });
        await row.locator("td").first().click();
        const dialog = b.getByRole("dialog");
        const newBounds = await dialog.boundingBox();
        expect(newBounds).not.toBeNull();
        expect(Math.round(newBounds?.x ?? -1)).toBe(
          Math.round(passwordBounds.x),
        );
        expect(Math.round(newBounds?.y ?? -1)).toBe(
          Math.round(passwordBounds.y),
        );
        expect(Math.round(newBounds?.width ?? -1)).toBe(
          Math.round(passwordBounds.width),
        );
        expect
          .soft(
            await dialog.getByRole("heading").innerText(),
            "password prompt title",
          )
          .toBe(passwordTitle);
        expect
          .soft(
            await dialog.locator("input").getAttribute("type"),
            "password prompt visibility",
          )
          .toBe(passwordType);
        await expect(dialog.locator("input")).toBeFocused();
        await b.keyboard.press("Escape");
        for (const fraction of [0.1, 0.5, 0.9]) {
          const { point } = await hitCursor(
            b,
            row.locator("td").last(),
            fraction,
          );
          await b.mouse.click(point.x, point.y);
          await expect(
            b.locator("#lobby-pregame"),
            `spectating via cell at ${fraction}`,
          ).toBeVisible();
          await expect(
            b.locator("#lobby-pregame .fa-key"),
            "pregame password icon",
          ).toBeVisible();
          await b
            .getByRole("button", { name: "Stop watching", exact: true })
            .click();
          await expect(row).toBeVisible();
        }
        await row.locator("td").first().click();
        await dialog.getByLabel("Table password").fill("wrong");
        await dialog.getByRole("button", { name: "Join table" }).click();
        await expect(b.getByRole("alert")).toContainText("password");
        await b.getByRole("button", { name: "Dismiss notice" }).click();
        await row.locator("td").first().click();
        const password = dialog.getByLabel("Table password");
        await expect(password).toHaveValue("wrong");
        await expect(password).toBeFocused();
        expect(
          await password.evaluate((input: HTMLInputElement) => [
            input.selectionStart,
            input.selectionEnd,
          ]),
        ).toEqual([0, 5]);
        await password.fill("parity");
        await password.press("Enter");
        await expect(b.locator(".seat .name-me")).toHaveText(viewerName);
        await b
          .getByRole("button", { name: "Leave table", exact: true })
          .click();
      } finally {
        await owner.close();
        await viewer.close();
      }
    },
  );
}

test(
  "profile destinations contain their score table at desktop and mobile widths",
  { tag: "@audit" },
  async ({ page, backend }, info) => {
    await login(page, backend, "testProfile");
    await classic(page, backend);
    const popupPromise = page.waitForEvent("popup");
    await page.locator("#lobby-users-table .name-me").click();
    const profile = await popupPromise;
    const failures: string[] = [];
    profile.on("pageerror", (error) => {
      failures.push(error.message);
    });
    await expect(profile).toHaveURL(/\/scores\/testProfile$/u);
    await expect(profile.locator("table.history")).toBeVisible();
    for (const width of [1440, 390]) {
      await profile.setViewportSize({ width, height: 1000 });
      await info.attach(`profile-${width}`, {
        body: await profile.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      const layout = await profile
        .locator("table.history")
        .evaluate((table) => {
          const box = table.closest(".box");
          if (!box) {
            throw new Error("Missing profile panel.");
          }
          return {
            documentFits:
              document.documentElement.scrollWidth <= globalThis.innerWidth,
            tableFits:
              table.getBoundingClientRect().right
              <= box.getBoundingClientRect().right,
            scrollContainer:
              table.parentElement !== box
              && table.parentElement?.scrollWidth !== undefined
              && getComputedStyle(table.parentElement).overflowX === "auto",
          };
        });
      expect
        .soft(layout.documentFits, `profile document width ${width}`)
        .toBe(true);
      expect
        .soft(
          layout.tableFits || layout.scrollContainer,
          `contained table width ${width}`,
        )
        .toBe(true);
    }
    expect(failures).toEqual([]);
    await profile.close();
    await page.goto(`${backend}/new`);
    const newProfile = page.locator("#lobby-users-table .person-main.name-me");
    await expect(
      newProfile,
      "online names must retain classic's direct profile link",
    ).toHaveAttribute("href", "/scores/testProfile");
    const nextPopup = page.waitForEvent("popup");
    await newProfile.click();
    const destination = await nextPopup;
    await expect(destination).toHaveURL(/\/scores\/testProfile$/u);
    await expect(destination.locator("table.history")).toBeVisible();
    await destination.close();
  },
);

test(
  "control-click copies the classic table URL without joining or opening a password prompt",
  { tag: "@audit" },
  async ({ browser, backend }) => {
    const owner = await browser.newContext();
    const viewer = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    try {
      const a = await owner.newPage();
      const b = await viewer.newPage();
      await login(a, backend, "testCopyOwner");
      await login(b, backend, "testCopyViewer");
      await a.getByRole("button", { name: "Create a table" }).click();
      await a.getByLabel("Table name", { exact: true }).fill("Copy parity");
      await a.getByLabel("Table password", { exact: true }).fill("parity");
      await a
        .getByRole("button", { name: "Create table", exact: true })
        .click();
      await expect(a.locator("#lobby-pregame")).toBeVisible();
      await classic(b, backend);
      const oldRow = b
        .locator("#lobby-games-table tbody tr")
        .filter({ hasText: "Copy parity" });
      await oldRow
        .locator("td")
        .first()
        .click({ modifiers: ["Control"] });
      const expected = await b.evaluate(
        async () => await globalThis.navigator.clipboard.readText(),
      );
      expect(expected).toMatch(/\/pre-game\/\d+$/u);
      await b.goto(`${backend}/new`);
      await b.evaluate(async () => {
        await globalThis.navigator.clipboard.writeText("");
      });
      await b
        .locator(".table-card")
        .filter({ hasText: "Copy parity" })
        .locator("td")
        .first()
        .click({ modifiers: ["Control"] });
      await expect(b).toHaveURL(`${backend}/new`);
      await expect(b.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            await b.evaluate(
              async () => await globalThis.navigator.clipboard.readText(),
            ),
        )
        .toBe(expected);
    } finally {
      await owner.close();
      await viewer.close();
    }
  },
);

for (const client of ["classic", "new"] as const) {
  test(
    `name-click shadow feedback and game viewpoint (${client})`,
    { tag: "@audit" },
    async ({ browser, backend }, info) => {
      const contexts = await Promise.all(
        [0, 1, 2].map(async () => await browser.newContext()),
      );
      try {
        const [a, b, c] = await Promise.all(
          contexts.map(async (context) => await context.newPage()),
        );
        if (!a || !b || !c) {
          throw new Error("Missing browser pages.");
        }

        const names = [
          `testSO${client}`,
          `testSG${client}`,
          `testSW${client}`,
        ] as const;
        await Promise.all(
          [a, b, c].map(async (page, index) => {
            const username = names[index];
            if (username === undefined) {
              throw new Error("Missing test account name.");
            }
            await login(page, backend, username);
          }),
        );
        await a.getByRole("button", { name: "Create a table" }).click();
        await a
          .getByLabel("Table name", { exact: true })
          .fill(`Shadow parity ${client}`);
        await a
          .getByRole("button", { name: "Create table", exact: true })
          .click();
        await expect(a.locator("#lobby-pregame")).toBeVisible();
        await b
          .locator(".table-card")
          .filter({ hasText: `Shadow parity ${client}` })
          .getByRole("button", { name: "Join", exact: true })
          .click();
        await expect(b.locator("#lobby-pregame")).toBeVisible();
        if (client === "classic") {
          await classic(c, backend);
        }
        const row = c
          .locator("#lobby-games-table tbody tr")
          .filter({ hasText: `Shadow parity ${client}` });
        await row.locator("td").last().click();
        await expect(c.locator("#lobby-pregame")).toBeVisible();
        if (client === "new") {
          await expect(
            c.getByRole("button", { name: "Watch instead" }),
          ).toHaveCount(0);
        } else {
          await expect(c.locator("#nav-buttons-pregame-spectate")).toBeHidden();
        }
        const scoreIcon = c
          .locator(
            client === "classic"
              ? "#lobby-pregame-player-1-scores-icon"
              : ".seat .classic-score-trigger",
          )
          .first();
        await scoreIcon.hover();
        const scores = c.locator(
          client === "classic" ? ".tooltipster-content" : '[role="tooltip"]',
        );
        await expect(scores).toBeVisible();
        await expect(scores).toContainText("2-player:");
        await expect(scores).toContainText("0 / 25");
        await c.mouse.move(0, 0);
        await expect(scores).toBeHidden();
        if (client === "new") {
          await scoreIcon.click();
          await expect(scores).toBeVisible();
          await c.keyboard.press("Escape");
          await expect(scores).toBeHidden();
        }
        const name = c
          .locator(client === "classic" ? "#lobby-pregame-player-1" : ".seat")
          .first()
          .getByText(names[0], { exact: true });
        const popups: Page[] = [];
        c.on("popup", (popup) => {
          popups.push(popup);
        });
        await name.click();
        const selected = c.locator("#lobby-pregame .unShadow");
        await expect(
          selected,
          "name click must indicate the selected shadow",
        ).toContainText(names[0]);
        await expect(selected).toContainText("\u{1F575}\u{FE0F}");
        await info.attach(`${client}-selected-shadow`, {
          body: await c.locator("#lobby-pregame").screenshot(),
          contentType: "image/png",
        });
        await selected.click();
        await expect(c.locator("#lobby-pregame .unShadow")).toHaveCount(0);
        await name.click();
        await expect(selected).toBeVisible();
        await a
          .getByRole("button", { name: "Start game", exact: true })
          .click();
        await expect(c.locator("canvas").first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(c).toHaveURL((url) =>
          /^\/game\/\d+\/shadow\/\d+$/u.test(url.pathname),
        );
        await expect
          .poll(
            async () =>
              await c.evaluate(() => {
                const window = globalThis as typeof globalThis & {
                  globals?: {
                    state: { shadowing: boolean; playing: boolean };
                    metadata: {
                      ourPlayerIndex: number;
                      playerNames: string[];
                    };
                  };
                };
                const metadata = window.globals?.metadata;
                return window.globals?.state.shadowing === true
                  && !window.globals.state.playing
                  && metadata !== undefined
                  ? metadata.playerNames[metadata.ourPlayerIndex]
                  : null;
              }),
          )
          .toBe(names[0]);
        expect(popups, "shadowing must not open a profile tab").toHaveLength(0);
      } finally {
        await Promise.all(
          contexts.map(async (context) => {
            await context.close();
          }),
        );
      }
    },
  );
}
