import type Konva from "konva";
import type { Context } from "konva/lib/Context";
import { NO_SHADOW_COLOR } from "../constants";

/**
 * Draws a shadowed shape as Konva 3 did: once with the shadow and once more on top without it, so
 * that the shadows of its fill and outline overlap but neither falls on the shape itself. Konva 10
 * draws it only once, or through a buffer that casts one flat shadow.
 */
export function drawWithKonva3Shadow(
  shape: Konva.Shape,
  context: Context,
  draw: () => void,
): void {
  if (shape.hasShadow() !== true || shape._useBufferCanvas()) {
    draw();
    return;
  }

  // Each pass is isolated, since drawing may change the context (such as by translating it).
  context.save();
  draw();
  context.restore();

  context.save();
  context.setAttr("shadowColor", NO_SHADOW_COLOR);
  draw();
  context.restore();
}
