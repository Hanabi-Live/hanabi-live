import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, gameReady, test } from "./fixture";

test.use({ actionTimeout: 10_000 });

async function auditViewport(
  page: Page,
  name: string,
  chat?: "lobby" | "table",
) {
  await page.evaluate(async () => await globalThis.document.fonts.ready);
  const cover = page.locator("#page-cover");
  if (await cover.isVisible()) {
    await expect(cover).toHaveCSS("opacity", "1");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (chat) {
    if (name.startsWith("old-")) {
      await page
        .locator(
          chat === "table"
            ? "#lobby-toggle-show-game-chat"
            : "#lobby-toggle-show-chat",
        )
        .click();
    } else {
      await page
        .getByRole("navigation", { name: "Mobile panels" })
        .getByRole("button", {
          name: chat === "table" ? "Game Chat" : "Chat",
          exact: true,
        })
        .click();
    }
  }
  expect
    .soft(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth
          <= globalThis.innerWidth,
      ),
      `${name} must fit mobile width`,
    )
    .toBe(true);
  if (
    [
      "new-replay-id",
      "new-replay-json",
      "new-resources",
      "new-settings",
    ].includes(name)
  ) {
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect
      .soft(
        audit.violations.map((issue) => ({
          id: issue.id,
          nodes: issue.nodes.map((node) => node.html),
        })),
        `${name} accessibility`,
      )
      .toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function toggleClassic(page: Page, id: string) {
  const checkbox = page.locator(`#${id}`);
  await checkbox.focus();
  await checkbox.press("Space");
}

async function loginNew(page: Page, backend: string, name: string) {
  await page.goto(`${backend}/new`);
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#lobby-games")).toBeVisible();
}

for (const theme of ["light", "dark"] as const) {
  test(
    `systematic old/new lobby screen audit (${theme})`,
    { tag: "@audit" },
    async ({ browser, backend }, info) => {
      test.skip(
        info.project.name !== "go",
        "Run the comprehensive UI audit once against the reference backend.",
      );
      test.setTimeout(180_000);
      const owner = await browser.newContext();
      const guest = await browser.newContext();
      const observer = await browser.newContext();
      const ownerName = `testAudit${theme}`;
      const guestName = `testPeer${theme}`;
      const observerName = `testWatch${theme}`;
      await Promise.all(
        [owner, guest, observer].map(async (context) => {
          await context.addInitScript((value: string) => {
            if (
              globalThis.location.protocol === "http:"
              || globalThis.location.protocol === "https:"
            ) {
              globalThis.localStorage.setItem(
                "darkMode",
                String(value === "dark"),
              );
            }
          }, theme);
        }),
      );
      let a = await owner.newPage();
      let b = await guest.newPage();
      const c = await observer.newPage();
      try {
        await a.goto(`${backend}/lobby`);
        await expect(a.locator("#login-username")).toBeVisible();
        await auditViewport(a, "old-login");
        await a.locator("#change-password-link").click();
        await expect(a.locator("#change-password")).toBeVisible();
        await a.locator("#change-password").click({ trial: true });
        await auditViewport(a, "old-change-password");
        await a.locator("#change-password-link").click();

        await b.goto(`${backend}/new`);
        await expect(b.getByLabel("Username", { exact: true })).toBeVisible();
        await auditViewport(b, "new-login");
        await expect(
          b.getByRole("link", { name: /Use the classic/u }),
        ).toHaveCount(0);
        await b
          .getByRole("button", { name: "Change password", exact: true })
          .click();
        await auditViewport(b, "new-change-password");
        await b.getByRole("button", { name: "Back to sign in" }).click();

        await a.locator("#login-username").fill(ownerName);
        await a.locator("#login-password").fill(ownerName);
        await a.locator("#login-button").click();
        await a.locator("#tutorial-no").click();
        await expect(a.locator("#lobby")).toBeVisible();
        await auditViewport(a, "old-empty-lobby");
        await a.locator("#nav-buttons-lobby-settings").click();
        await expect(a.locator("#settings-modal")).toBeVisible();
        await auditViewport(a, "old-settings");
        await a.keyboard.press("Escape");
        await a.locator("#nav-buttons-lobby-resources").click();
        await expect(a.locator("#resources-modal")).toBeVisible();
        await auditViewport(a, "old-resources");
        await a.keyboard.press("Escape");
        await a.locator("#nav-buttons-lobby-replay").click();
        await expect(a.locator("#replay-modal")).toBeVisible();
        await auditViewport(a, "old-replay-id");
        await a.locator('label[for="replay-source-json"]').click();
        await a.locator("#replay-json").fill('{"players":["Alice","Bob"]}');
        await auditViewport(a, "old-replay-json");
        await a.keyboard.press("Escape");

        await a.locator("#nav-buttons-lobby-create-game").click();
        await expect(a.locator("#createTableName")).not.toHaveValue("");
        await a.locator("#createTableName").fill("Audit game");
        await auditViewport(a, "old-create-basic");
        await toggleClassic(a, "createTableTimed");
        await auditViewport(a, "old-create-timed");
        await toggleClassic(a, "createTableTimed");
        await a.locator("#create-game-show-extra-options").click();
        await toggleClassic(a, "createTableEmptyClues");
        await auditViewport(a, "old-create-extra");
        await a
          .locator("#create-game-variant-dropdown1")
          .selectOption({ label: "Search custom variants..." });
        await a.locator("#create-game-variant-dropdown2").fill("No Variant");
        await a.locator("#create-game-variant-dropdown2").press("Tab");
        await auditViewport(a, "old-create-custom");
        await a.locator("#createTableName").fill("Audit game");
        await a.locator("#create-game-submit").click();
        await expect(a.locator("#lobby-pregame")).toBeVisible();
        await b.goto(`${backend}/lobby`);
        await b.locator("#login-username").fill(guestName);
        await b.locator("#login-password").fill(guestName);
        await b.locator("#login-button").click();
        await b.locator("#tutorial-no").click();
        await expect(b.locator("#lobby-games-table")).toContainText(
          "Audit game",
        );
        await auditViewport(b, "old-populated-lobby");
        await b
          .locator("#lobby-games-table tbody tr")
          .filter({ hasText: "Audit game" })
          .click();
        await expect(b.locator("#lobby-pregame")).toBeVisible();
        await auditViewport(b, "old-guest-pregame");
        const oldGuest = b;
        b = await guest.newPage();
        await b.goto(`${backend}/new`);
        await expect(b.locator("#lobby-games")).toBeVisible();
        await oldGuest.close();
        await auditViewport(b, "new-populated-lobby");
        await b
          .locator(".table-card")
          .filter({ hasText: "Audit game" })
          .getByRole("button", { name: /Join|Resume/u })
          .click();
        await expect(b.locator("#lobby-pregame")).toBeVisible();
        if (
          (await b
            .getByRole("button", { name: "Join game", exact: true })
            .count()) > 0
        ) {
          await b
            .getByRole("button", { name: "Join game", exact: true })
            .click();
        }
        await expect(
          b.locator(".seat").filter({ hasText: guestName }),
        ).toHaveCount(1);
        await expect(a.locator("#lobby-pregame-player-2")).toBeVisible();
        await auditViewport(a, "old-owner-pregame");
        await auditViewport(b, "new-guest-pregame");
        await b.getByRole("button", { name: "Suggest options" }).click();
        await auditViewport(b, "new-guest-options");
        await b.keyboard.press("Escape");
        await expect(b).toHaveURL(/\/new\/table\/\d+$/u);
        await a
          .locator("#lobby-chat-input")
          .fill(`/pm ${guestName} Private audit message`);
        await a.locator("#lobby-chat-input").press("Enter");
        await expect(a.locator("#lobby-chat-pregame-text")).toContainText(
          "Private audit message",
        );
        await auditViewport(a, "old-private-chat", "table");
        await b.getByRole("button", { name: /^Messages/u }).click();
        await expect(
          b.getByRole("log", { name: "private messages" }),
        ).toContainText("Private audit message");
        await auditViewport(b, "new-private-chat", "lobby");
        await b.setViewportSize({ width: 390, height: 360 });
        expect(
          await b
            .getByLabel("Chat message", { exact: true })
            .evaluate((element) => {
              const panel = element.closest(".chat-panel");
              if (!panel) {
                throw new Error(
                  "The private composer must be inside its chat panel.",
                );
              }
              const bounds = panel.getBoundingClientRect();
              const composer = element.getBoundingClientRect();
              return (
                composer.top >= bounds.top && composer.bottom <= bounds.bottom
              );
            }),
        ).toBe(true);
        await b.setViewportSize({ width: 1440, height: 1000 });

        await loginNew(c, backend, observerName);
        await c
          .locator(".table-card")
          .filter({ hasText: "Audit game" })
          .getByRole("button", { name: "Watch table" })
          .click();
        await expect(c.locator("#lobby-pregame")).toBeVisible();
        await auditViewport(c, "new-spectator-pregame");
        await c.setViewportSize({ width: 390, height: 844 });
        await expect
          .soft(c.getByRole("button", { name: /Join game/iu }))
          .toBeVisible();
        await c.setViewportSize({ width: 1440, height: 1000 });

        const oldOwner = a;
        a = await owner.newPage();
        await a.goto(`${backend}/new`);
        await expect(a.locator("#lobby-games")).toBeVisible();
        await oldOwner.close();
        await a
          .locator(".table-card")
          .filter({ hasText: "Audit game" })
          .getByRole("button", { name: /Join|Resume/u })
          .click();
        await expect(a.locator("#lobby-pregame")).toBeVisible();
        if (
          (await a
            .getByRole("button", { name: "Join game", exact: true })
            .count()) > 0
        ) {
          await a
            .getByRole("button", { name: "Join game", exact: true })
            .click();
        }
        await expect(
          a.locator(".seat").filter({ hasText: ownerName }),
        ).toHaveCount(1);
        if (
          (await a.getByRole("button", { name: "Suggest options" }).count()) > 0
        ) {
          const candidates = await Promise.all(
            [a, b, c].map(async (page) => ({
              page,
              owns:
                (await page
                  .getByRole("button", { name: "Table options", exact: true })
                  .count()) > 0,
            })),
          );
          const leader = candidates.find((candidate) => candidate.owns)?.page;
          if (!leader) {
            throw new Error(
              `No active owner UI: ${await a.locator("#header").innerText()} / ${await b.locator("#header").innerText()} / ${await c.locator("#header").innerText()}`,
            );
          }
          const ownerCard = leader
            .locator(".seat")
            .filter({ hasText: ownerName });
          await ownerCard.getByLabel(`Actions for ${ownerName}`).click();
          await ownerCard.getByRole("button", { name: "Make host" }).click();
          await expect(
            a.getByRole("button", { name: "Table options" }),
          ).toBeVisible();
        }
        await auditViewport(a, "new-owner-pregame");
        await expect(a.locator(".seat .name-me")).toHaveText(ownerName);
        await a.getByRole("button", { name: "Table options" }).click();
        await expect(a.getByLabel(/^Empty clues/u)).toBeVisible();
        await expect(a.getByLabel(/^Empty clues/u)).toBeChecked();
        await auditViewport(a, "new-owner-options");
        await a.keyboard.press("Escape");
        await a.getByRole("button", { name: "Back to tables" }).click();
        await a.getByRole("link", { name: "Settings", exact: true }).click();
        await expect(
          a.getByRole("dialog", { name: "Settings", exact: true }),
        ).toBeVisible();
        await auditViewport(a, "new-settings");
        await expect(
          a.getByRole("link", { name: /Use the classic/u }),
        ).toHaveCount(0);
        await a.keyboard.press("Escape");
        await a.getByRole("link", { name: "Resources", exact: true }).click();
        await auditViewport(a, "new-resources");
        await a.keyboard.press("Escape");
        await a.getByRole("link", { name: "Replays", exact: true }).click();
        await auditViewport(a, "new-replay-id");
        await a.getByRole("radio", { name: "JSON Data" }).check();
        await a
          .getByLabel("Replay JSON", { exact: true })
          .fill('{"players":["Alice","Bob"]}');
        await auditViewport(a, "new-replay-json");
        await a.keyboard.press("Escape");
        await a.getByRole("button", { name: "Create a table" }).click();
        await a.getByLabel("Table name", { exact: true }).fill("Audit game");
        await a.getByText("Hide Extra Options", { exact: true }).click();
        await auditViewport(a, "new-create-basic");
        await a.getByLabel("Timed game", { exact: true }).check();
        await auditViewport(a, "new-create-timed");
        await a.getByLabel("Timed game", { exact: true }).uncheck();
        await a.getByText("Show Extra Options", { exact: true }).click();
        await auditViewport(a, "new-create-extra");
        await a.getByLabel("Variant", { exact: true }).selectOption("custom");
        await a.getByLabel("Variant", { exact: true }).fill("No Variant");
        await auditViewport(a, "new-create-custom");
        await a.keyboard.press("Escape");

        await a
          .locator(".table-card")
          .filter({ hasText: "Audit game" })
          .getByRole("button", { name: "Resume", exact: true })
          .click();
        const ready = gameReady(a);
        await a.getByRole("button", { name: "Start game" }).click();
        await ready;
        await a.keyboard.press("Alt+c");
        await a.locator("#game-chat-input").fill("/terminate");
        await a.locator("#game-chat-input").press("Enter");
        await expect(a).toHaveURL(/\/shared-replay\/\d+/u);
        await a.keyboard.press("Escape");
        await a.keyboard.press("Alt+l");
        await expect(a).toHaveURL(/\/new$/u);
        await a.getByRole("link", { name: "History", exact: true }).click();
        await expect(a.locator(".history-card")).toHaveCount(1);
        await expect(
          a.locator(".history-card").getByLabel("Empty clues"),
        ).toBeVisible();
        await expect(a.locator(".history-card")).toContainText("0/25");
        await a.locator(".classic-history").hover();
        await expect(a.locator(".classic-history .classic-filters")).toHaveCSS(
          "opacity",
          "1",
        );
        await auditViewport(a, "new-history");
        await a
          .getByRole("button", { name: "Compare seed", exact: true })
          .click();
        await expect(
          a.getByRole("dialog", { name: "Other Scores" }),
        ).toBeVisible();
        await expect(a.getByRole("dialog")).toContainText(ownerName);
        await auditViewport(a, "new-other-scores");
        const seed = await a.locator(".dialog-heading p").innerText();
        await a.keyboard.press("Escape");
        await expect.soft(a).toHaveURL(/\/new\/history$/u);
        await a.goto(`${backend}/new/history?friends=1`);
        await auditViewport(a, "new-friends-history");
        await a.goto(`${backend}/lobby`);
        await expect(a.locator("#nav-buttons-lobby-history")).toBeVisible();
        await a.locator("#nav-buttons-lobby-history").click();
        await expect(a.locator("#lobby-history-table-tbody tr")).toHaveCount(1);
        await auditViewport(a, "old-history");
        await a.goto(
          `${backend}/lobby#history-other-scores-${encodeURIComponent(seed)}`,
        );
        await expect(a.locator("#lobby-history-other-scores")).toBeVisible();
        await expect(
          a
            .locator("#lobby-history-other-scores-table-tbody tr")
            .filter({ hasText: ownerName }),
        ).toHaveCount(1);
        await auditViewport(a, "old-other-scores");
        await a.goto(`${backend}/lobby#history-friends`);
        await expect(a.locator("#lobby-history")).toBeVisible();
        await auditViewport(a, "old-friends-history");
        await a.goto(`${backend}/new/table/999999`);
        await expect(
          a.getByRole("heading", {
            name: "That table is no longer available.",
          }),
        ).toBeVisible();
        await auditViewport(a, "new-unavailable-table");
        await a.getByRole("link", { name: "Return to the lobby" }).click();
        await owner.setOffline(true);
        await expect(
          a.getByText("Reconnecting...", { exact: true }),
        ).toBeVisible();
        await auditViewport(a, "new-reconnecting");
        await owner.setOffline(false);
        await expect(a.getByText("Connected", { exact: true })).toBeVisible();
      } finally {
        await Promise.all([owner.close(), guest.close(), observer.close()]);
      }
    },
  );
}
