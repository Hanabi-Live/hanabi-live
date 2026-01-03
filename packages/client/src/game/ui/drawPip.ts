import type { Suit, Variant } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { DRAW_PIP_FUNCTIONS } from "./drawPipFunctions";

export function drawPip(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  variant: Variant,
  shadow?: boolean,
  customFill?: string,
  lineWidth?: number,
  highlight?: boolean,
): void {
  // Positive indication for color pips.
  if (highlight === true) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(3, 5, 100, 0, 360);
    ctx.fillStyle = "rgba(238, 188, 29, 0.3)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Most suits have a shape defined in the "suits.json" file (as the "pip" property). But we get
  // the pip from the variant object instead of the suit object in case the pip is
  // automatically/dynamically calculated.
  const suitIndex = variant.suits.findIndex(
    (variantSuit) => variantSuit.id === suit.id,
  );
  if (suitIndex === -1) {
    throw new Error(`Failed to find the index for suit: ${suit.name}`);
  }
  const pip = variant.pips[suitIndex];
  assertDefined(pip, `Failed to find the pip for suit index: ${suitIndex}`);

  // Handle the shadow.
  if (shadow === true) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  }

  const hasCustomFill = customFill !== undefined && customFill !== "";

  // In some variants, there can be two suits with the same pip, like "Rainbow & Muddy Rainbow". To
  // disambiguate the suits, we draw a circle around the second suit that has the same pip.
  const previousPips = variant.pips.slice(0, suitIndex);
  const isDuplicatePip = previousPips.includes(pip);
  if (isDuplicatePip) {
    ctx.scale(0.8, 0.8);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 80, 80, 0, 0, 2 * Math.PI);
    ctx.moveTo(90, 0);
    ctx.ellipse(0, 0, 90, 90, 0, 0, 2 * Math.PI);

    if (hasCustomFill) {
      ctx.fillStyle = customFill!;
    } else if (suit.fill === "multi") {
      const colors = suit.fillColors;
      const grad = ctx.createLinearGradient(0, -100, 30, 100);
      for (const [i, color] of colors.entries()) {
        grad.addColorStop(i / (colors.length - 1), color);
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = suit.fill;
    }

    // Workaround for Konva.Shape's Context not supporting `evenodd`. This is used in e.g. Empathy
    // view.
    interface KonvaCanvas {
      _context: CanvasRenderingContext2D | undefined;
    }
    const konvaCanvas = ctx as unknown as KonvaCanvas;

    const canvasFillRule = "evenodd";
    const context = konvaCanvas._context;
    if (context === undefined) {
      ctx.fill(canvasFillRule);
    } else {
      context.fill(canvasFillRule);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.stroke();
    ctx.restore();
  }

  const drawPipFunction = DRAW_PIP_FUNCTIONS[pip];
  if (hasCustomFill) {
    // The parent function has specified a custom fill color.
    ctx.fillStyle = customFill!;
    drawPipFunction(ctx);
    ctx.fill();
  } else if (suit.fill === "multi") {
    // Rainbow and omni cards have a multiple color fill which is passed as an array to the drawing
    // function; the drawing function will handle the filling.
    drawPipFunction(ctx, suit.fillColors);
  } else {
    // All other suits have a solid fill. (We want the black pip to have an off-black custom fill so
    // that the border is visible on the pip.)
    const fill = suit.name === "Black" ? "#212121" : suit.fill;
    ctx.fillStyle = fill;
    drawPipFunction(ctx);
    ctx.fill();
  }

  // Draw a black border around the shape.
  if (shadow === true) {
    ctx.lineWidth = lineWidth ?? (hasCustomFill ? 8 : 5);
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
  } else {
    ctx.lineWidth = 3;
  }
  ctx.stroke();
}
