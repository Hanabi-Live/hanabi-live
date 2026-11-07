import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

export async function captureDialog(
  page: Page,
  dialog: Locator,
): Promise<Buffer> {
  const box = await dialog.boundingBox();
  if (box === null) {
    throw new Error("Missing dialog bounds.");
  }
  // Align both captures to rendered pixels, not different fractional crop expansions.
  return await page.screenshot({
    animations: "disabled",
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  });
}

export async function captureInteraction(
  page: Page,
  dialog: Locator,
): Promise<{ hover: Buffer; focus: Buffer }> {
  const buttons = dialog.locator("button");
  const control =
    (await buttons.count()) > 0 ? buttons.last() : dialog.locator("a").first();
  await control.hover();
  const hover = await captureDialog(page, dialog);
  await page.keyboard.press("Tab");
  await control.focus();
  const focus = await captureDialog(page, dialog);
  return { hover, focus };
}

export async function compareImages(
  page: Page,
  info: TestInfo,
  name: string,
  reference: Buffer,
  actual: Buffer,
): Promise<void> {
  const result = await page.evaluate(
    async ({ before, after }) => {
      const { Blob, OffscreenCanvas } = globalThis;

      async function decode(data: string) {
        const bytes = Uint8Array.from(globalThis.atob(data), (character) =>
          // eslint-disable-next-line unicorn/prefer-code-point -- Decoded Base64 is a binary byte string, not Unicode text.
          character.charCodeAt(0),
        );
        return await globalThis.createImageBitmap(
          new Blob([bytes], { type: "image/png" }),
        );
      }
      const [left, right] = await Promise.all([decode(before), decode(after)]);
      const width = Math.max(left.width, right.width);
      const height = Math.max(left.height, right.height);
      function pixels(image: ImageBitmap) {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Missing image comparison context.");
        }
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      }
      const a = pixels(left);
      const b = pixels(right);
      let changed = 0;
      for (let index = 0; index < a.length; index += 4) {
        if (
          [0, 1, 2, 3].some(
            (channel) =>
              Math.abs((a[index + channel] ?? 0) - (b[index + channel] ?? 0))
              > 16,
          )
        ) {
          changed++;
        }
      }
      const dimensions = {
        reference: [left.width, left.height],
        actual: [right.width, right.height],
      };
      left.close();
      right.close();
      return { ...dimensions, changed, pixels: width * height };
    },
    { before: reference.toString("base64"), after: actual.toString("base64") },
  );
  await info.attach(`${name}-classic`, {
    body: reference,
    contentType: "image/png",
  });
  await info.attach(`${name}-new`, { body: actual, contentType: "image/png" });
  await info.attach(`${name}-comparison`, {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect.soft(result.actual, `${name} dimensions`).toEqual(result.reference);
  expect
    .soft(result.changed / result.pixels, `${name} changed pixel fraction`)
    .toBeLessThan(0.001);
}
