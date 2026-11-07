/* eslint-disable no-await-in-loop -- Volume values and reference screens are sequential user interactions. */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";
import {
  captureDialog,
  captureInteraction,
  compareImages,
} from "./visualComparison";

test.use({ actionTimeout: 10_000 });

async function login(page: Page, backend: string, name: string) {
  await page.goto(`${backend}/lobby`);
  await page.locator("#login-username").fill(name);
  await page.locator("#login-password").fill(name);
  await page.locator("#login-button").click();
  await page.locator("#tutorial-no").click();
  await expect(page.locator("#lobby")).toBeVisible();
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(
      `Settings matches classic pixels (${theme}, ${width})`,
      { tag: "@audit" },
      async ({ page, backend }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((dark) => {
          localStorage.setItem("darkMode", String(dark));
        }, theme === "dark");
        await login(page, backend, `tS${theme}${width}`);
        await page.locator("#nav-buttons-lobby-settings").click();
        const classic = page.locator("#settings-modal");
        await expect(classic).toBeVisible();
        await page.evaluate(async () => {
          await globalThis.document.fonts.ready;
        });
        await page.mouse.move(0, 0);
        const reference = await captureDialog(page, classic);
        const testButton = await classic
          .locator("#settings-volume-test")
          .evaluate((button) => {
            const style = getComputedStyle(button);
            const { height, width: buttonWidth } =
              button.getBoundingClientRect();
            return {
              height,
              width: buttonWidth,
              font: style.font,
              padding: style.padding,
              margin: style.margin,
              lineHeight: style.lineHeight,
            };
          });
        await classic.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        const scroll = await classic.evaluate((element) => ({
          height: element.scrollHeight,
          visible: element.clientHeight,
          top: element.scrollTop,
        }));
        const referenceBottom = await captureDialog(page, classic);
        const interactions = await captureInteraction(page, classic);
        await classic.locator("#settings-volume-slider").focus();
        const rangeFocus = await captureDialog(page, classic);
        await page.keyboard.press("Escape");
        await page.goto(`${backend}/new`);
        await page.getByRole("link", { name: "Settings", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await page.evaluate(async () => {
          await globalThis.document.fonts.ready;
        });
        await page.mouse.move(0, 0);
        expect
          .soft(
            await dialog.locator("#settings-volume-test").evaluate((button) => {
              const style = getComputedStyle(button);
              const { height, width: buttonWidth } =
                button.getBoundingClientRect();
              return {
                height,
                width: buttonWidth,
                font: style.font,
                padding: style.padding,
                margin: style.margin,
                lineHeight: style.lineHeight,
              };
            }),
            "test button geometry",
          )
          .toEqual(testButton);
        await compareImages(
          page,
          info,
          "settings",
          reference,
          await captureDialog(page, dialog),
        );
        await dialog.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect
          .soft(
            await dialog.evaluate((element) => ({
              height: element.scrollHeight,
              visible: element.clientHeight,
              top: element.scrollTop,
            })),
            "scroll extents",
          )
          .toEqual(scroll);
        await compareImages(
          page,
          info,
          "settings-bottom",
          referenceBottom,
          await captureDialog(page, dialog),
        );
        const actualInteractions = await captureInteraction(page, dialog);
        await compareImages(
          page,
          info,
          "settings-hover",
          interactions.hover,
          actualInteractions.hover,
        );
        await compareImages(
          page,
          info,
          "settings-focus",
          interactions.focus,
          actualInteractions.focus,
        );
        await dialog.locator("#settings-volume-slider").focus();
        await compareImages(
          page,
          info,
          "settings-range-focus",
          rangeFocus,
          await captureDialog(page, dialog),
        );
      },
    );
  }
}

type AudioWindow = typeof globalThis & { previewAudio?: HTMLMediaElement };

test(
  "volume preview reports an unavailable sound inside Settings",
  { tag: "@audit" },
  async ({ page, backend }) => {
    await login(page, backend, "tSoundError");
    await page.goto(`${backend}/new`);
    await page.route("**/public/sounds/turn-us.mp3", async (route) => {
      await route.fulfill({ status: 404, body: "Sound unavailable" });
    });
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Test", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Playing the test sound",
    );
  },
);

for (const [client, width] of [
  ["classic", 1440],
  ["new", 1440],
  ["classic", 390],
  ["new", 390],
] as const) {
  test(
    `volume preview plays the real sound at the chosen level (${client}, ${width})`,
    { tag: "@audit" },
    async ({ page, backend }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- The original media method is forwarded with its actual receiver.
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = async function play(
          this: HTMLMediaElement,
        ) {
          (globalThis as AudioWindow).previewAudio = this;
          await original.call(this);
        };
      });
      await login(page, backend, `tA${client[0]}${width}`);
      if (client === "new") {
        await page.goto(`${backend}/new`);
        await page.getByRole("link", { name: "Settings", exact: true }).click();
      } else {
        await page.locator("#nav-buttons-lobby-settings").click();
      }
      const slider =
        client === "new"
          ? page.getByLabel("Volume", { exact: true })
          : page.locator("#settings-volume-slider");
      const button =
        client === "new"
          ? page.getByRole("button", { name: "Test", exact: true })
          : page.locator("#settings-volume-test");
      await slider.scrollIntoViewIfNeeded();
      const bounds = await slider.boundingBox();
      if (bounds === null) {
        throw new Error("Missing volume slider.");
      }
      await slider.click({
        position: { x: bounds.width / 2, y: bounds.height / 2 },
      });
      await expect(slider).toHaveValue("50");
      for (const value of [0, 50, 100]) {
        await slider.press("Home");
        for (let step = 0; step < value / 5; step++) {
          await slider.press("ArrowRight");
        }
        await button.click();
        await expect
          .poll(
            async () =>
              await page.evaluate(() => {
                const audio = (globalThis as AudioWindow).previewAudio;
                return audio
                  ? {
                      volume: audio.volume,
                      decoded:
                        Number.isFinite(audio.duration) && audio.duration > 0,
                      progressed: audio.currentTime > 0,
                    }
                  : null;
              }),
          )
          .toEqual({ volume: value / 100, decoded: true, progressed: true });
      }
      await page.keyboard.press("Escape");
      await page.reload();
      if (client === "new") {
        await page.getByRole("link", { name: "Settings", exact: true }).click();
      } else {
        await page.locator("#tutorial-no").click();
        await page.locator("#nav-buttons-lobby-settings").click();
      }
      await expect(slider).toHaveValue("100");
    },
  );
}
