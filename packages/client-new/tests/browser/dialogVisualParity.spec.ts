import type { Locator } from "@playwright/test";
import { expect, setClassicCheckbox, test } from "./fixture";
import {
  captureDialog,
  captureInteraction,
  compareImages,
} from "./visualComparison";

test.use({ actionTimeout: 10_000 });

async function dialogContents(dialog: Locator) {
  return await dialog.evaluate((element) => ({
    links: [...element.querySelectorAll("a")]
      .filter((link) => link.getClientRects().length > 0)
      .map((link) => ({
        text: link.textContent.replaceAll(/\s+/gu, " ").trim(),
        href: link.getAttribute("href"),
        target: link.getAttribute("target"),
      })),
    icons: [...element.querySelectorAll("i")]
      .filter((icon) => icon.getClientRects().length > 0)
      .map((icon) => {
        const box = icon.getBoundingClientRect();
        const parent = element.getBoundingClientRect();
        return {
          glyph: [...icon.classList]
            .filter((name) => name.startsWith("fa-"))
            .join(" "),
          x: Math.round(box.x - parent.x),
          y: Math.round(box.y - parent.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          color: getComputedStyle(icon).color,
          display: getComputedStyle(icon).display,
        };
      }),
  }));
}

async function timerValuesFit(dialog: Locator): Promise<readonly boolean[]> {
  return await dialog
    .locator('#create-game-timed-row input[type="text"]')
    .evaluateAll((inputs: readonly HTMLInputElement[]) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) {
        throw new Error("Missing text measurement context.");
      }
      return inputs.map((input) => {
        const style = getComputedStyle(input);
        context.font = style.font;
        const available =
          input.clientWidth
          - Number(style.paddingLeft.replace(/px$/u, ""))
          - Number(style.paddingRight.replace(/px$/u, ""));
        return context.measureText(input.value).width <= available;
      });
    });
}

const modes = [
  "create",
  "timed",
  "extra",
  "custom",
  "basic-return",
  "edit",
  "replay",
  "json",
  "resources",
] as const;
for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    for (const [index, mode] of modes.entries()) {
      test(
        `dialog pixel parity ${mode} (${theme}, ${width})`,
        { tag: "@audit" },
        async ({ page, backend }, info) => {
          await page.setViewportSize({
            width: mode === "resources" ? 1440 : width,
            height: 1000,
          });
          await page.addInitScript((dark) => {
            localStorage.setItem("darkMode", String(dark));
          }, theme === "dark");
          const name = `tD${index}${theme[0]}${width}`;
          await page.goto(`${backend}/lobby`);
          await page.locator("#login-username").fill(name);
          await page.locator("#login-password").fill(name);
          await page.locator("#login-button").click();
          await page.locator("#tutorial-no").click();
          let tableID: string | undefined;
          const replay = mode === "replay" || mode === "json";
          const create = !replay && mode !== "resources";
          if (create) {
            await page.locator("#nav-buttons-lobby-create-game").click();
            await expect(page.locator("#create-game-modal")).toBeVisible();
            await expect(page.locator("#createTableName")).toHaveValue(
              `${name}'s table`,
            );
            if (mode === "edit") {
              await page.locator("#create-game-submit").click();
              await expect(page.locator("#lobby-pregame")).toBeVisible();
              tableID = new URL(page.url()).pathname.split("/").at(-1);
              await page.locator("#nav-buttons-pregame-change-options").click();
              await expect(page.locator("#create-game-modal")).toBeVisible();
            }
            switch (mode) {
              case "timed": {
                await page.locator("#createTableTimed").press("Space");
                await expect(page.locator("#createTableTimed")).toBeChecked();

                break;
              }

              case "extra": {
                await page.locator("#create-game-show-extra-options").click();

                break;
              }

              case "custom":
              case "basic-return": {
                await page
                  .locator("#create-game-variant-dropdown1")
                  .selectOption({ label: "Search custom variants..." });
                await page
                  .locator("#create-game-variant-dropdown2")
                  .fill(mode === "custom" ? "Rainbow (5 Suits)" : "No Variant");

                break;
              }
              // No default
            }
          } else {
            await page
              .locator(
                replay
                  ? "#nav-buttons-lobby-replay"
                  : "#nav-buttons-lobby-resources",
              )
              .click();
            await expect(
              page.locator(replay ? "#replay-modal" : "#resources-modal"),
            ).toBeVisible();
            if (mode === "json") {
              await page.locator("#replay-source-json").press("Space");
            }
          }
          let selector = "#resources-modal";
          if (create) {
            selector = "#create-game-modal";
          } else if (replay) {
            selector = "#replay-modal";
          }
          const classic = page.locator(selector);
          await expect(classic).toBeVisible();
          await page.setViewportSize({ width, height: 1000 });
          await classic.locator("h2").click();
          await page.evaluate(async () => {
            await globalThis.document.fonts.ready;
          });
          await page.mouse.move(0, 0);
          if (mode === "timed") {
            expect
              .soft(
                await timerValuesFit(classic),
                "classic timer values must not be clipped",
              )
              .toEqual([true, true]);
          }
          const title = await classic.locator("h2").innerText();
          const contents = await dialogContents(classic);
          const linkStyle = await classic
            .locator("a")
            .first()
            .evaluateAll((links: readonly Element[]) =>
              links.map((link) => {
                const style = getComputedStyle(link);
                const icon = link.querySelector("i");
                const before = icon && getComputedStyle(icon, "::before");
                const parent = link.closest(".modal");
                if (!parent) {
                  throw new Error("Missing reference dialog.");
                }
                const bounds = link.getBoundingClientRect();
                return {
                  color: style.color,
                  font: style.font,
                  opacity: style.opacity,
                  x: bounds.x - parent.getBoundingClientRect().x,
                  y: bounds.y - parent.getBoundingClientRect().y,
                  width: bounds.width,
                  height: bounds.height,
                  icon: before
                    ? {
                        content: before.content,
                        font: before.font,
                        color: before.color,
                        display: before.display,
                      }
                    : null,
                };
              }),
            );
          const reference = await captureDialog(page, classic);
          await classic.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          const referenceBottom = await captureDialog(page, classic);
          const interactions = await captureInteraction(page, classic);
          await page.keyboard.press("Escape");
          await page.goto(
            `${backend}/new${tableID === undefined ? "" : `/table/${tableID}`}`,
          );
          if (mode === "resources") {
            await page.setViewportSize({ width: 1440, height: 1000 });
          }
          if (create) {
            await page
              .getByRole("button", {
                name: mode === "edit" ? "Table options" : "Create a table",
                exact: true,
              })
              .click();
            switch (mode) {
              case "timed": {
                // Classic saves this preference immediately, even when its dialog is canceled.
                await setClassicCheckbox(
                  page.getByLabel("Timed game", { exact: true }),
                );

                break;
              }

              case "extra": {
                await page
                  .getByText("Show Extra Options", { exact: true })
                  .click();

                break;
              }

              case "custom":
              case "basic-return": {
                const variant = page.getByLabel("Variant", { exact: true });
                if (
                  await variant.evaluate(
                    (element) => element.tagName === "SELECT",
                  )
                ) {
                  await variant.selectOption("custom");
                }
                await page
                  .getByLabel("Variant", { exact: true })
                  .fill(mode === "custom" ? "Rainbow (5 Suits)" : "No Variant");

                break;
              }
              // No default
            }
          } else {
            await page
              .getByRole("link", {
                name: replay ? "Replays" : "Resources",
                exact: true,
              })
              .click();
            if (mode === "json") {
              await page.locator('label[for="replay-source-json"]').click();
            }
          }
          const dialog = page.getByRole("dialog");
          await page.setViewportSize({ width, height: 1000 });
          await dialog.getByRole("heading").click();
          if (mode === "timed") {
            expect
              .soft(
                await timerValuesFit(dialog),
                "new timer values must not be clipped",
              )
              .toEqual([true, true]);
          }
          expect
            .soft(
              await dialog
                .locator("a")
                .first()
                .evaluateAll((links: readonly Element[]) =>
                  links.map((link) => {
                    const style = getComputedStyle(link);
                    const icon = link.querySelector("i");
                    const before = icon && getComputedStyle(icon, "::before");
                    const parent = link.closest(".modal");
                    if (!parent) {
                      throw new Error("Missing compared dialog.");
                    }
                    const bounds = link.getBoundingClientRect();
                    return {
                      color: style.color,
                      font: style.font,
                      opacity: style.opacity,
                      x: bounds.x - parent.getBoundingClientRect().x,
                      y: bounds.y - parent.getBoundingClientRect().y,
                      width: bounds.width,
                      height: bounds.height,
                      icon: before
                        ? {
                            content: before.content,
                            font: before.font,
                            color: before.color,
                            display: before.display,
                          }
                        : null,
                    };
                  }),
                ),
              "link styles",
            )
            .toEqual(linkStyle);
          await expect.soft(dialog.getByRole("heading")).toHaveText(title);
          expect
            .soft(
              await dialogContents(dialog),
              "visible icons and link destinations",
            )
            .toEqual(contents);
          await page.evaluate(async () => {
            await globalThis.document.fonts.ready;
          });
          await page.mouse.move(0, 0);
          await compareImages(
            page,
            info,
            mode,
            reference,
            await captureDialog(page, dialog),
          );
          await dialog.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await compareImages(
            page,
            info,
            `${mode}-bottom`,
            referenceBottom,
            await captureDialog(page, dialog),
          );
          const actualInteractions = await captureInteraction(page, dialog);
          await compareImages(
            page,
            info,
            `${mode}-hover`,
            interactions.hover,
            actualInteractions.hover,
          );
          await compareImages(
            page,
            info,
            `${mode}-focus`,
            interactions.focus,
            actualInteractions.focus,
          );
        },
      );
    }
  }
}
