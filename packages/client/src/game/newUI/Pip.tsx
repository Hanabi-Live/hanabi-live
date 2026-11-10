import type { Suit, Variant } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";
import { PIP_RADIUS, drawPip } from "../ui/drawPip";

/**
 * The width of the area that a pip is drawn in, in the pip's own units. It leaves room for the ring
 * around a duplicate pip and for the pip's border.
 */
const PIP_BOX = 2.2 * PIP_RADIUS;

/**
 * A suit's symbol, drawn by the same code as the classic game screen, so that every variant works.
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
    const ctx = canvas?.getContext("2d");
    if (canvas === null || ctx === null || ctx === undefined) {
      return;
    }

    const pixels = Math.ceil(size * window.devicePixelRatio);
    canvas.width = pixels;
    canvas.height = pixels;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixels, pixels);
    ctx.translate(pixels / 2, pixels / 2);
    ctx.scale(pixels / PIP_BOX, pixels / PIP_BOX);
    drawPip(ctx, suit, variant);
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
