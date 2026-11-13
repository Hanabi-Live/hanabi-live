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
 * A suit's symbol, drawn by the same code as the classic game screen, so that every variant works.
 *
 * The canvas has one pixel for each pixel of the display, so that the pip stays sharp when the game
 * screen is zoomed. A `ResizeObserver` gives that size, and draws the pip again when the zoom or
 * the display's pixel ratio changes.
 */
export function Pip({
  suit,
  variant,
  size,
}: {
  readonly suit: Suit;
  readonly variant: Variant;

  /** The width and height, in CSS pixels. */
  readonly size: number;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      Math.ceil(size * getScreenScale() * window.devicePixelRatio),
    );

    const observer = new ResizeObserver(
      ([entry]: readonly ResizeObserverEntry[]) => {
        const box = entry?.devicePixelContentBoxSize[0];
        if (box !== undefined && box.inlineSize !== canvas.width) {
          drawOnCanvas(canvas, suit, variant, box.inlineSize);
        }
      },
    );
    observer.observe(canvas, { box: "device-pixel-content-box" });

    return () => {
      observer.disconnect();
    };
  }, [suit, variant, size]);

  return (
    <canvas
      aria-hidden="true"
      className="tw:block tw:shrink-0"
      ref={canvasRef}
      style={{ width: size, height: size }}
    />
  );
}

/** Draws the pip on a canvas of this many pixels on each side. */
function drawOnCanvas(
  canvas: HTMLCanvasElement,
  suit: Suit,
  variant: Variant,
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
  ctx.scale(pixels / PIP_BOX, pixels / PIP_BOX);
  drawPip(ctx, suit, variant);
}
