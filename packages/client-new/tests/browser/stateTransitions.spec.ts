import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";

async function login(
  page: Page,
  backend: string,
  name: string,
  classic = false,
) {
  await page.goto(`${backend}/${classic ? "lobby" : "new"}`);
  if (classic) {
    await page.locator("#login-username").fill(name);
    await page.locator("#login-password").fill(name);
    await page.locator("#login-button").click();
    await page.locator("#tutorial-no").click();
  } else {
    await page.getByLabel("Username", { exact: true }).fill(name);
    await page.getByLabel("Password", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
  }
}

for (const client of ["classic", "new"] as const) {
  test(
    `removal leaves the pregame without retargeting its editor (${client})`,
    { tag: "@audit" },
    async ({ browser, backend }) => {
      const owner = await browser.newContext();
      const guest = await browser.newContext();
      try {
        const a = await owner.newPage();
        const b = await guest.newPage();
        const name = `tGuest${client}`;
        await login(a, backend, `tHost${client}`);
        await login(b, backend, name, client === "classic");
        await a.getByRole("button", { name: "Create a table" }).click();
        await a.getByLabel("Table name", { exact: true }).fill(name);
        await a
          .getByRole("button", { name: "Create table", exact: true })
          .click();
        await expect(a.locator("#lobby-pregame")).toBeVisible();
        if (client === "classic") {
          await b
            .locator("#lobby-games-table tbody tr")
            .filter({ hasText: name })
            .locator("td")
            .first()
            .click();
        } else {
          await b
            .getByRole("row", { name: `Join ${name}`, exact: true })
            .getByRole("button", { name: "Join", exact: true })
            .click();
        }

        await expect(b.locator("#lobby-pregame")).toBeVisible();
        if (client === "new") {
          await b.getByRole("button", { name: "Suggest options" }).click();
          await b
            .getByLabel("Table name", { exact: true })
            .fill("Retained draft");
        }
        const hostChat = a.getByLabel("Pre-game chat message", { exact: true });
        await hostChat.fill(`/kick ${name}`);
        await hostChat.press("Enter");
        await expect(b.locator("#lobby-games")).toBeVisible();
        if (client === "new") {
          await expect(b.getByLabel("Table name", { exact: true })).toHaveValue(
            "Retained draft",
          );
          await b
            .getByRole("button", { name: "Update table", exact: true })
            .click();
          await expect(b.getByRole("dialog").getByRole("alert")).toContainText(
            "no longer available",
          );
          await expect(
            b.getByRole("button", { name: "Create table", exact: true }),
          ).toHaveCount(0);
          await b.keyboard.press("Escape");
          await expect(
            b.getByRole("row", { name: `Join ${name}`, exact: true }),
          ).toBeVisible();
        }
      } finally {
        await owner.close();
        await guest.close();
      }
    },
  );
}

for (const outcome of ["accepted", "rejected", "disconnected"] as const) {
  test(
    `pending creation survives navigation and ${outcome} responses`,
    { tag: "@audit" },
    async ({ page, backend }) => {
      let submissions = 0;
      let release: (() => void) | undefined;
      let disconnect: (() => Promise<void>) | undefined;
      await page.routeWebSocket(/\/ws(?:\?|$)/u, (socket) => {
        const server = socket.connectToServer();
        const held: Array<string | Buffer> = [];
        let holding = false;
        server.onMessage((message) => {
          if (holding) {
            held.push(message);
          } else {
            socket.send(message);
          }
        });
        socket.onMessage((message) => {
          const text = message.toString();
          if (text.startsWith("tableCreate ")) {
            submissions++;
            holding = submissions === 1;
            if (outcome === "rejected" && submissions === 1) {
              const payload: unknown = JSON.parse(
                text.slice("tableCreate ".length),
              );
              if (typeof payload !== "object" || payload === null) {
                throw new Error("Missing table creation payload.");
              }
              // Numeric player counts are normalized; inject a wire-validation failure.
              server.send(
                `tableCreate ${JSON.stringify({ ...payload, maxPlayers: "invalid" })}`,
              );
              return;
            }
          }
          server.send(message);
        });
        release = () => {
          holding = false;
          for (const message of held.splice(0)) {
            socket.send(message);
          }
        };
        disconnect = async () => {
          held.length = 0;
          await Promise.all([socket.close(), server.close()]);
        };
      });
      const name = `t${outcome}`;
      await login(page, backend, name);
      await page.getByRole("link", { name: "History", exact: true }).click();
      await page
        .getByRole("link", { name: "Return to Lobby", exact: true })
        .click();
      await page.getByRole("button", { name: "Create a table" }).click();
      await page.getByLabel("Table name", { exact: true }).fill(name);
      if (outcome === "accepted") {
        await page
          .getByLabel("Variant", { exact: true })
          .selectOption("custom");
        await page
          .getByLabel("Variant", { exact: true })
          .fill("Black (5 Suits)");
      }
      const dialog = page.getByRole("dialog");
      const submit = dialog.getByRole("button", {
        name: "Create table",
        exact: true,
      });
      await submit.dblclick();
      await expect.poll(() => submissions).toBe(1);
      await expect(dialog).toBeVisible();
      await expect(submit).toBeDisabled();
      if (outcome === "accepted") {
        const dice = page.getByRole("button", {
          name: "Choose a random variant",
        });
        await expect(dice).toBeDisabled();
        const bounds = await dice.boundingBox();
        if (!bounds) {
          throw new Error("Missing rendered dice control.");
        }
        await page.mouse.click(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        await expect(page.getByLabel("Variant", { exact: true })).toHaveValue(
          "Black (5 Suits)",
        );
      }
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(`${backend}/new/history`);
      await page.goForward();
      await expect(page).toHaveURL(`${backend}/new`);
      await expect(page.getByLabel("Table name", { exact: true })).toHaveValue(
        name,
      );
      expect(submissions).toBe(1);
      if (!release || !disconnect) {
        throw new Error("The submission connection was not intercepted.");
      }
      if (outcome === "disconnected") {
        await disconnect();
        await expect(dialog.getByRole("alert")).toContainText(
          "may have succeeded",
        );
        await expect(
          page.getByRole("status", {
            name: "Connection status",
            includeHidden: true,
          }),
        ).toHaveText("Connected");
        await expect(
          page.getByLabel("Table name", { exact: true }),
        ).toHaveValue(name);
        await page.keyboard.press("Escape");
      } else {
        release();
        if (outcome === "rejected") {
          await expect(dialog.getByRole("alert")).toContainText(
            /player count|players/iu,
          );
          await expect(
            page.getByLabel("Table name", { exact: true }),
          ).toHaveValue(name);
          await expect(submit).toBeEnabled();
          await submit.click();
        }
        await expect(dialog).toBeHidden();
        await expect(page.locator("#lobby-pregame")).toContainText(name);
        await page
          .getByRole("button", { name: "Back to tables", exact: true })
          .click();
      }
      await expect(
        page.getByRole("row", { name: `Resume ${name}`, exact: true }),
      ).toHaveCount(1);
      expect(submissions).toBe(outcome === "rejected" ? 2 : 1);
    },
  );
}

for (const previous of ["classic", "new"] as const) {
  test(
    `a replacement tab fences the old writer and preserves authoritative settings and table state (${previous})`,
    { tag: "@audit" },
    async ({ context, page, backend }) => {
      let welcomes = 0;
      let confirmedVolume: string | undefined;
      await page.routeWebSocket(/\/ws(?:\?|$)/u, (socket) => {
        const server = socket.connectToServer();
        const syncVolumes: Array<string | undefined> = [];
        let currentVolume: string | undefined;
        socket.onMessage((message) => {
          const text = message.toString();
          if (text.startsWith("setting ")) {
            const data: unknown = JSON.parse(text.slice("setting ".length));
            if (
              typeof data === "object"
              && data !== null
              && "name" in data
              && data.name === "volume"
              && "setting" in data
              && typeof data.setting === "string"
            ) {
              currentVolume = data.setting;
            }
          }
          if (text.startsWith("sync ")) {
            syncVolumes.push(currentVolume);
          }
          server.send(message);
          if (previous === "classic" && text.startsWith("setting ")) {
            syncVolumes.push(currentVolume);
            server.send("sync {}");
          }
        });
        server.onMessage((message) => {
          const text = message.toString();
          if (text.startsWith("welcome ")) {
            welcomes++;
          }
          if (text.startsWith("synced ")) {
            confirmedVolume = syncVolumes.shift();
          } else {
            socket.send(message);
          }
        });
      });
      const name = `tTabs${previous}`;
      await login(page, backend, name, previous === "classic");
      if (previous === "classic") {
        await page.locator("#nav-buttons-lobby-settings").click();
      } else {
        await page.getByRole("link", { name: "Settings", exact: true }).click();
      }
      const oldVolume = page.locator("#settings-volume-slider");
      await oldVolume.focus();
      await oldVolume.press("Home");
      await oldVolume.press("ArrowRight");
      await expect.poll(() => confirmedVolume).toBe("5");
      if (previous === "new") {
        await expect(page.getByLabel("Preference saving status")).toContainText(
          "Saving",
        );
      }
      const other = await context.newPage();
      await other.goto(`${backend}/new`);
      if (previous === "new") {
        await expect(
          other.getByRole("status", { name: "Connection status" }),
        ).toHaveText("Connected");
        await expect(
          page.getByRole("status", {
            name: "Connection status",
            includeHidden: true,
          }),
        ).toHaveText("Disconnected");
        await expect(oldVolume).toBeDisabled();
        await expect(page.getByLabel("Preference saving status")).toContainText(
          "Offline",
        );
        await expect(page.locator(".global-notice")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Retry", exact: true }),
        ).toHaveCount(0);
      }
      await expect(page.locator("#error-modal")).toBeVisible();
      await expect(page.locator("#error-modal")).toContainText(
        "another browser tab",
      );
      await expect(
        page.locator("#error-modal").getByRole("button", { name: "Reload" }),
      ).toBeVisible();
      await expect(
        page.locator("#error-modal").getByRole("button", { name: "Sign Out" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#error-modal")).toBeVisible();
      await other.getByRole("button", { name: "Create a table" }).click();
      await other.getByLabel("Table name", { exact: true }).fill(name);
      await other
        .getByRole("button", { name: "Create table", exact: true })
        .click();
      await expect(other.locator("#lobby-pregame")).toContainText(name);
      await other
        .getByRole("button", { name: "Table options", exact: true })
        .click();
      await other
        .getByLabel("Table name", { exact: true })
        .fill("Updated by the active tab");
      await other
        .getByRole("button", { name: "Update table", exact: true })
        .click();
      await expect(other.getByRole("dialog")).toBeHidden();
      await expect(other.locator("#lobby-pregame")).toContainText(
        "Updated by the active tab",
      );
      await other
        .getByRole("button", { name: "Back to tables", exact: true })
        .click();
      await other.getByRole("link", { name: "Settings", exact: true }).click();
      const volume = other.getByLabel("Volume", { exact: true });
      await expect(volume).toHaveValue("5");
      await volume.focus();
      await volume.press("ArrowRight");
      await expect(other.getByLabel("Preference saving status")).toContainText(
        "saved",
      );
      await other.reload();
      await expect(other.getByLabel("Volume", { exact: true })).toHaveValue(
        "10",
      );
      expect(welcomes).toBe(1);
      if (previous === "new") {
        await expect(oldVolume).toBeDisabled();
      } else {
        await expect(page.locator("#error-modal")).toBeVisible();
      }
    },
  );
}
