// The redesigned game screen grows with the window, as a game's HUD does: it is laid out for one
// window size, and a larger window shows all of it larger, with the CSS "zoom" property. Inside the
// zoomed screen, CSS pixels are larger than the pixels of the window, so measurements from the
// window (such as `getBoundingClientRect` and the pointer's position) are divided by the scale
// before they become styles or transforms.

import { clamp } from "complete-common";

/** The window size that the screen was laid out for. It shows at a scale of 1. */
const REFERENCE_SIZE = {
  width: 1600,
  height: 900,
} as const;

/**
 * The smallest scale. A laptop window that is a little smaller than the reference shows the same
 * layout, a little smaller, instead of a layout for a narrower screen. Below this scale, the text
 * gets too small to read, so a smaller window keeps this scale and the layout's own breakpoints
 * take over.
 */
const MIN_SCREEN_SCALE = 0.8;

/** The largest scale. */
const MAX_SCREEN_SCALE = 1.75;

/** The widest window that shows the phone layout (see `STACKED_WIDTH_QUERY` in "hooks.ts"). */
export const STACKED_MAX_WIDTH = 956;

let screenScale = 1;

/**
 * The scale for a window size: as large as fits both its width and its height. The phone layout
 * does not scale, since it scrolls instead.
 */
export function getScreenScaleForWindow(width: number, height: number): number {
  return width <= STACKED_MAX_WIDTH
    ? 1
    : clamp(
        Math.min(width / REFERENCE_SIZE.width, height / REFERENCE_SIZE.height),
        MIN_SCREEN_SCALE,
        MAX_SCREEN_SCALE,
      );
}

/** The scale that the screen shows at now. */
export function getScreenScale(): number {
  return screenScale;
}

export function setScreenScale(scale: number): void {
  screenScale = scale;
}

/** Converts a length in the window's pixels into the screen's CSS pixels. */
export function toScreenPixels(length: number): number {
  return length / screenScale;
}

/** Where an element is, in the screen's CSS pixels. */
export function measure(element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  return new DOMRect(
    rect.x / screenScale,
    rect.y / screenScale,
    rect.width / screenScale,
    rect.height / screenScale,
  );
}
