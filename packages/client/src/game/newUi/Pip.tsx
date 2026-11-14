import type { Suit, Variant } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";
import { PIP_RADIUS, drawPip } from "../ui/drawPip.ts";
import { getScreenScale } from "./screenScale.ts";

/**
 * The width of the area that a pip is drawn in, in the pip's own units. It leaves room for the ring
 * around a duplicate pip and for the pip's border.
 */
const PIP_BOX = 2.2 * PIP_RADIUS;

/**
 * How far the shadow under a pip spreads, in the pip's own units. It matches the shadow under the
 * smaller pips on a classic card's face, which spreads 10 of the card's units at a scale of 0.4.
 */
const PIP_SHADOW_BLUR = 25;

/**
 * The width of the area that a pip with a shadow is drawn in, so that the shadow is not cut off.
 */
const SHADOWED_PIP_BOX = PIP_BOX + 2 * PIP_SHADOW_BLUR;

/**
 * A suit's symbol, drawn by the same code as the classic game screen, so that every variant works.
 * With `shadow`, it has the thicker border and the shadow of the pips on a classic card's face.
 *
 * The canvas has one pixel for each pixel of the display, so that the pip stays sharp when the game
 * screen is zoomed. A `ResizeObserver` gives that size, and draws the pip again when the zoom or
 * the display's pixel ratio changes.
 */
export function Pip({
  suit,
  variant,
  size,
  shadow = false,
}: {
  readonly suit: Suit;
  readonly variant: Variant;

  /** The width and height, in CSS pixels. */
  readonly size: number;

  readonly shadow?: boolean;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // A shadowed pip's canvas is larger, so that its shadow fits. Negative margins keep the pip in
  // the same place.
  const pipBox = shadow ? SHADOWED_PIP_BOX : PIP_BOX;
  const canvasSize = (size * pipBox) / PIP_BOX;
  const margin = (size - canvasSize) / 2;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return undefined;
    }

    // Draw at once, so that the pip does not flash empty before the observer reports.
    drawOnCanvas(
      canvas,
      suit,
      variant,
      shadow,
      Math.ceil(canvasSize * getScreenScale() * window.devicePixelRatio),
    );

    const observer = new ResizeObserver(
      ([entry]: readonly ResizeObserverEntry[]) => {
        const box = entry?.devicePixelContentBoxSize[0];
        if (box !== undefined && box.inlineSize !== canvas.width) {
          drawOnCanvas(canvas, suit, variant, shadow, box.inlineSize);
        }
      },
    );
    observer.observe(canvas, { box: "device-pixel-content-box" });

    return () => {
      observer.disconnect();
    };
  }, [suit, variant, shadow, canvasSize]);

  return (
    <canvas
      aria-hidden="true"
      className="tw:block tw:shrink-0"
      ref={canvasRef}
      style={{
        width: canvasSize,
        height: canvasSize,
        margin,
      }}
    />
  );
}

/** Draws the pip on a canvas of this many pixels on each side. */
function drawOnCanvas(
  canvas: HTMLCanvasElement,
  suit: Suit,
  variant: Variant,
  shadow: boolean,
  pixels: number,
) {
  const ctx = canvas.getContext("2d");
  if (ctx === null || pixels === 0) {
    return;
  }
  canvas.width = pixels;
  canvas.height = pixels;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixels, pixels);
  ctx.translate(pixels / 2, pixels / 2);
  const box = shadow ? SHADOWED_PIP_BOX : PIP_BOX;
  const scale = pixels / box;
  ctx.scale(scale, scale);
  if (shadow) {
    // The canvas does not scale a shadow's blur with the drawing.
    ctx.shadowBlur = PIP_SHADOW_BLUR * scale;
  }
  drawPip(ctx, suit, variant, shadow);
}
