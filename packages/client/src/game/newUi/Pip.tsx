import type { Suit, Variant } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";
import { CARD_FACE_SHADOW_BLUR } from "../ui/constants.ts";
import { FACE_PIP_SCALE, PIP_RADIUS, drawPip } from "../ui/drawPip.ts";
import { getScreenScale } from "./screenScale.ts";

/**
 * The width of the area that a pip is drawn in, in the pip's own units. It leaves room for the ring
 * around a duplicate pip and for the pip's border.
 */
const PIP_BOX = 2.2 * PIP_RADIUS;

/**
 * How far the shadow under a pip spreads, in the pip's own units. It matches the shadow under the
 * smaller pips on a classic card's face.
 */
const PIP_SHADOW_BLUR = CARD_FACE_SHADOW_BLUR / FACE_PIP_SCALE;

/**
 * The width of the area that a pip with a shadow is drawn in, so that the shadow is not cut off.
 */
const SHADOWED_PIP_BOX = PIP_BOX + 2 * PIP_SHADOW_BLUR;

/**
 * How many drawn pips to keep. A pip is drawn again for each size, such as while the window changes
 * size, so the oldest ones are dropped.
 */
const MAX_CACHED_PIPS = 500;

/** The image of each pip that was drawn, by what it shows and its size in display pixels. */
const pipImages = new Map<string, string>();

/**
 * A suit's symbol, drawn by the same code as the classic game screen, so that every variant works.
 * With `shadow`, it has the thicker border and the shadow of the pips on a classic card's face.
 *
 * The image has one pixel for each pixel of the display, so that the pip stays sharp when the game
 * screen is zoomed. A `ResizeObserver` gives that size, and draws the pip again when the zoom or
 * the display's pixel ratio changes.
 *
 * The pip is an image instead of a canvas. The browser gives each canvas a layer of its own, and so
 * also everything drawn over it, which slows down every change of the screen. Each pip is drawn
 * once for each size, so that a hand that shows its player's view draws at once.
 */
export function Pip({
  suit,
  variant,
  size,
  shadow = false,
  fill,
}: {
  readonly suit: Suit;
  readonly variant: Variant;

  /** The width and height, in CSS pixels. */
  readonly size: number;

  readonly shadow?: boolean;

  /** One color for the whole pip, instead of the suit's colors. */
  readonly fill?: string;
}): React.JSX.Element {
  const imageRef = useRef<HTMLImageElement>(null);

  // A shadowed pip's image is larger, so that its shadow fits. Negative margins keep the pip in the
  // same place.
  const pipBox = shadow ? SHADOWED_PIP_BOX : PIP_BOX;
  const imageSize = (size * pipBox) / PIP_BOX;
  const margin = (size - imageSize) / 2;

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image === null) {
      return undefined;
    }

    let shownPixels = 0;
    function show(pixels: number) {
      if (image === null || pixels === shownPixels) {
        return;
      }
      const source = getPipImage(suit, variant, shadow, fill, pixels);
      if (source === undefined) {
        return;
      }

      image.src = source;
      shownPixels = pixels;
    }

    // Draw at once, so that the pip does not flash empty before the observer reports.
    show(Math.ceil(imageSize * getScreenScale() * window.devicePixelRatio));

    // Safari cannot give the size in display pixels, and throws if asked. There, the pip stays as
    // drawn above.
    if (!supportsDevicePixelBox()) {
      return undefined;
    }

    const observer = new ResizeObserver(
      ([entry]: readonly ResizeObserverEntry[]) => {
        const box = entry?.devicePixelContentBoxSize[0];
        if (box !== undefined) {
          show(box.inlineSize);
        }
      },
    );
    observer.observe(image, { box: "device-pixel-content-box" });

    return () => {
      observer.disconnect();
    };
  }, [suit, variant, shadow, fill, imageSize]);

  return (
    <img
      alt=""
      aria-hidden="true"
      className="tw:block tw:shrink-0"
      decoding="sync"
      draggable={false}
      ref={imageRef}
      style={{
        width: imageSize,
        height: imageSize,
        margin,
      }}
    />
  );
}

/** Whether a `ResizeObserver` can report an element's size in display pixels. */
function supportsDevicePixelBox(): boolean {
  return (
    typeof ResizeObserverEntry !== "undefined"
    && "devicePixelContentBoxSize" in ResizeObserverEntry.prototype
  );
}

/**
 * The image of a pip that is this many pixels on each side, as a data URL. A data URL shows on the
 * first frame, with no wait for it to load.
 */
function getPipImage(
  suit: Suit,
  variant: Variant,
  shadow: boolean,
  fill: string | undefined,
  pixels: number,
): string | undefined {
  const key = [variant.id, suit.id, shadow, fill, pixels].join(",");
  const cached = pipImages.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  if (!drawOnCanvas(canvas, suit, variant, shadow, fill, pixels)) {
    return undefined;
  }
  const image = canvas.toDataURL();
  if (pipImages.size >= MAX_CACHED_PIPS) {
    const [oldest] = pipImages.keys();
    if (oldest !== undefined) {
      pipImages.delete(oldest);
    }
  }
  pipImages.set(key, image);
  return image;
}

/** Draws the pip on a canvas of this many pixels on each side. Returns whether it could. */
function drawOnCanvas(
  canvas: HTMLCanvasElement,
  suit: Suit,
  variant: Variant,
  shadow: boolean,
  fill: string | undefined,
  pixels: number,
): boolean {
  const ctx = canvas.getContext("2d");
  if (ctx === null || pixels === 0) {
    return false;
  }
  canvas.width = pixels;
  canvas.height = pixels;
  ctx.translate(pixels / 2, pixels / 2);
  const box = shadow ? SHADOWED_PIP_BOX : PIP_BOX;
  const scale = pixels / box;
  ctx.scale(scale, scale);
  if (shadow) {
    // The canvas does not scale a shadow's blur with the drawing.
    ctx.shadowBlur = PIP_SHADOW_BLUR * scale;
  }
  drawPip(ctx, suit, variant, shadow, fill);
  return true;
}
