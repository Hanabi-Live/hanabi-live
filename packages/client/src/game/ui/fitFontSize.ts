import { MIN_FONT_SIZE } from "./constants.ts";

/** The search for a font size stops when it is this close to the best size, in pixels. */
const FONT_SIZE_TOLERANCE = 0.5;

let measuringContext: CanvasRenderingContext2D | null | undefined;

/**
 * Returns the largest font size, up to `maxFontSize`, at which `text` fits on one line of `width`
 * pixels. It measures the text the same way as the `FitText` canvas element, so text in the DOM
 * shrinks to the same size.
 */
export function fitFontSize(
  text: string,
  fontFamily: string,
  maxFontSize: number,
  width: number,
): number {
  measuringContext ??= document.createElement("canvas").getContext("2d");
  const context = measuringContext;
  // Without a canvas to measure with, such as in tests, use the largest size.
  if (
    context === null
    || maxFontSize <= MIN_FONT_SIZE
    || textWidth(context, text, fontFamily, maxFontSize) <= width
  ) {
    return maxFontSize;
  }

  // Binary search the largest font size that fits.
  let low = MIN_FONT_SIZE;
  let high = maxFontSize;
  while (high - low > FONT_SIZE_TOLERANCE) {
    const mid = low + (high - low) / 2;
    if (textWidth(context, text, fontFamily, mid) <= width) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

function textWidth(
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontSize: number,
): number {
  context.font = `${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
}
