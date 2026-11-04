import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, gameReady, test } from "./fixture";

test("design prototypes remain interactive without opening a live session", async ({
  page,
  backend,
}) => {
  const liveRequests: string[] = [];
  page.on("websocket", (socket) => {
    liveRequests.push(socket.url());
  });
  page.on("request", (request) => {
    if (
      ["/login", "/logout", "/test-cookie"].includes(
        new URL(request.url()).pathname,
      )
    ) {
      liveRequests.push(request.url());
    }
  });
  await page.goto(`${backend}/public/client-new/prototypes.html`);
  await expect(
    page.getByRole("heading", { name: /Find your kind/u }),
  ).toBeVisible();
  await expect(page.locator(".study-card")).toHaveCount(10);
  await page.getByRole("link", { name: /01 Clubhouse/u }).click();
  const preview = page.frameLocator("iframe");
  await preview.getByLabel("Find a table").fill("not a real table");
  await expect(
    preview.getByRole("heading", { name: "No tables found" }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Clear filters" }).click();
  await expect(preview.locator(".proto-table")).toHaveCount(5);
  await preview.getByRole("button", { name: "Create sample table" }).click();
  const dialog = preview.getByRole("dialog");
  await dialog.getByLabel("Table name").fill("A sample game");
  await dialog.getByRole("button", { name: "Create sample table" }).click();
  await expect(
    preview.getByRole("button", { name: "A sample game" }),
  ).toBeVisible();
  await preview
    .getByLabel("Sample chat message")
    .fill("This stays in the prototype.");
  await preview.getByRole("button", { name: "Send sample message" }).click();
  await expect(preview.getByRole("log")).toContainText(
    "This stays in the prototype.",
  );
  await page.getByRole("button", { name: "Mobile preview" }).click();
  await expect(page.locator("iframe")).toHaveCSS("width", "390px");
  await page.getByLabel("Design", { exact: true }).selectOption("felt");
  await expect(
    preview.getByRole("heading", { name: "Pull up a chair." }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "First game? Welcome!" }).click();
  await expect(
    preview.getByRole("region", { name: "Selected sample table" }),
  ).toContainText("First game? Welcome!");
  expect(liveRequests).toEqual([]);
});

async function login(page: Page, backend: string, name: string) {
  const response = await page.goto(`${backend}/new/`);
  expect(response?.headers()["cache-control"]).toContain("no-cache");
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("#lobby-games")).toBeVisible();
}

test("creation options, protected joins, invitations, friends, private chat and settings persist", async ({
  browser,
  backend,
}) => {
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  const outsider = await browser.newContext();
  const a = await owner.newPage();
  const b = await guest.newPage();
  const c = await outsider.newPage();
  await login(a, backend, "testUIHost");
  await login(b, backend, "testUIGuest");
  await login(c, backend, "testUIObserver");
  await a.getByRole("link", { name: "Settings", exact: true }).first().click();
  await a.getByLabel("Colorblind-friendly cards").check();
  const volume = a.getByRole("slider");
  await volume.focus();
  await volume.press("Home");
  await volume.press("ArrowRight");
  await volume.press("ArrowRight");
  await volume.press("ArrowRight");
  await expect(
    a.getByRole("status", { name: "Preference saving status" }),
  ).toHaveText("Preferences saved");
  await a.reload();
  await expect(a.getByLabel("Colorblind-friendly cards")).toBeChecked();
  await expect(a.getByRole("slider")).toHaveValue("15");
  await a.keyboard.press("Escape");
  await a.getByRole("link", { name: "Play", exact: true }).click();
  await a.getByRole("button", { name: "Create a table", exact: true }).click();
  const dialog = a.getByRole("dialog");
  await dialog.getByLabel("Table name", { exact: true }).fill("Private garden");
  await dialog.getByLabel("Variant", { exact: true }).selectOption("6 Suits");
  await dialog.getByLabel("Maximum players").fill("3");
  await dialog.getByLabel(/^Table password/u).fill("cards");
  await dialog.getByLabel("Timed game").check();
  await dialog.getByLabel("Base time (minutes)").fill("3");
  await dialog.getByLabel("Seconds per turn").fill("15");
  await dialog.getByText("Show Extra Options", { exact: true }).click();
  await dialog.getByLabel(/^Empty clues/u).check();
  await dialog
    .getByRole("button", { name: "Create table", exact: true })
    .click();
  await expect(
    a.getByRole("heading", { name: "Private garden", exact: true }),
  ).toBeVisible();
  const invitation = a.url();
  await b.goto(invitation);
  await b
    .getByRole("dialog")
    .getByLabel("Table password", { exact: true })
    .fill("cards");
  await b
    .getByRole("dialog")
    .getByRole("button", { name: "Join table" })
    .click();
  await expect(a.locator(".seat:not(.empty-seat)")).toHaveCount(2);
  await expect(b.getByText("Timed: 3m + 15s", { exact: true })).toBeVisible();
  await a.getByRole("button", { name: "Table options", exact: true }).click();
  await a.getByRole("dialog").getByLabel("Maximum players").fill("4");
  await a
    .getByRole("dialog")
    .getByRole("button", { name: "Update table" })
    .click();
  await expect(b.locator(".classic-room-info")).toContainText("6 Suits");
  await expect(b.locator(".classic-room-info")).toContainText("2 / 4");
  await b.getByRole("button", { name: "Back to tables" }).click();
  await b.getByRole("link", { name: "History", exact: true }).click();
  await b.getByRole("link", { name: "Play", exact: true }).click();
  await b
    .locator(".table-card")
    .filter({ hasText: "Private garden" })
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  await expect(b).toHaveURL(/\/new\/table\/\d+$/u);
  const host = b.locator(".person").filter({ hasText: "testUIHost" });
  await host.locator(".person-main").click();
  await host.getByRole("button", { name: "Add friend" }).click();
  await expect(host.getByRole("button", { name: "Unfriend" })).toBeVisible();
  await host.getByRole("button", { name: "Message", exact: true }).click();
  await b
    .getByLabel("Chat message", { exact: true })
    .fill("Private draft, not for the lobby.");
  await b.getByRole("button", { name: "Lobby", exact: true }).click();
  await expect(b.getByLabel("Chat message", { exact: true })).toHaveValue("");
  await b.getByRole("button", { name: /^Messages/u }).click();
  await expect(b.getByLabel("Chat message", { exact: true })).toHaveValue(
    "Private draft, not for the lobby.",
  );
  await b
    .getByLabel("Chat message", { exact: true })
    .fill("Only the host should see this.");
  await b.getByLabel("Chat message", { exact: true }).press("Enter");
  await expect(a.getByRole("button", { name: /^Messages/u })).toContainText(
    "1",
  );
  await a.getByRole("button", { name: /^Messages/u }).click();
  await expect(
    a.getByText("Only the host should see this.", { exact: true }),
  ).toBeVisible();
  await c.getByRole("button", { name: /^Messages/u }).click();
  await expect(
    c.getByText("Only the host should see this.", { exact: true }),
  ).toHaveCount(0);
  await a.screenshot({
    path: test.info().outputPath("pregame-private-chat.png"),
    fullPage: true,
  });
  await owner.close();
  await guest.close();
  await outsider.close();
});

test("mobile navigation, accessible dialogs and safe chat rendering", async ({
  browser,
  backend,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await login(page, backend, "testUIMobile");
  await expect(
    page.getByRole("navigation", { name: "Mobile panels" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth
        <= globalThis.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Create a table", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByLabel("Variant", { exact: true })
    .selectOption("custom");
  await page
    .getByRole("dialog")
    .getByLabel("Variant", { exact: true })
    .fill("No Variant");
  const modalAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    modalAudit.violations.map((issue) => ({
      id: issue.id,
      nodes: issue.nodes.map((node) => node.html),
    })),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.reload();
  await expect(page.getByLabel("Appearance", { exact: true })).toHaveValue(
    "dark",
  );
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Mobile panels" })
    .getByRole("button", { name: "Chat", exact: true })
    .click();
  await page
    .getByLabel("Chat message", { exact: true })
    .fill('<img src=x onerror="alert(1)">');
  await page.getByLabel("Chat message", { exact: true }).press("Enter");
  await expect(
    page
      .getByRole("log")
      .getByText('<img src=x onerror="alert(1)">', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("log").locator("img")).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((issue) => ({
      id: issue.id,
      nodes: issue.nodes.map((node) => node.html),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("new-lobby-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  await context.close();
});

test("JSON replay import enters the existing replay and returns to the new UI", async ({
  browser,
  backend,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, backend, "testUIReplay");
  await page.getByRole("link", { name: "Replays", exact: true }).click();
  await page.getByRole("button", { name: "JSON file" }).click();
  await page
    .getByLabel("Replay JSON", { exact: true })
    .fill(JSON.stringify({ players: ["Alice", "Bob"], seed: "p2v0s1" }));
  const ready = gameReady(page);
  await page.getByRole("button", { name: "Open replay" }).click();
  await ready;
  await expect(page).toHaveURL(/\/replay\/-?\d+(?:#\d+)?$/u);
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.keyboard.press("Alt+l");
  await expect(page).toHaveURL(/\/new$/u);
  await expect(page.locator("#lobby-games")).toBeVisible();
  await context.close();
});
