import type { Suit, Variant } from "@hanabi-live/game";
import { BLACK_SUIT_NAME } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import {
  CARD_IMAGE_SHADOW_COLOR,
  CARD_W,
  FULL_CIRCLE_RADIANS,
  NO_SHADOW_COLOR,
} from "./constants.ts";
import { DRAW_PIP_FUNCTIONS } from "./drawPipFunctions.ts";

/** The scale of the suit pips arranged in a ring on an unknown card and on the deck. */
export const SUIT_PIP_SCALE = 0.4;

/** The scale of the suit pips at the top, bottom, and sides of a card's face. */
export const FACE_PIP_SCALE = 0.4;

/** The distance of each pip in the ring from the middle of the card, before scaling. */
const SUIT_PIP_RING_RADIUS = 0.7 * CARD_W;

/** The ring starts at the top of the card, a quarter turn from the positive x axis. */
const SUIT_PIP_RING_START_TURNS = 0.25;

/** The translucent yellow glow behind a color pip that a positive clue has confirmed. */
const POSITIVE_PIP_HIGHLIGHT_COLOR = "rgba(238, 188, 29, 0.3)";

/** The black pip is filled off-black so that its black border stays visible. */
const BLACK_PIP_FILL = "#212121";

/** The width of the black border around a pip, in the pip's own units. */
const PIP_BORDER_WIDTH = {
  PLAIN: 3,

  /** Pips drawn with a shadow get a thicker border. */
  SHADOWED: 5,

  /** The gray pips on an unknown card get a thicker border still. */
  SHADOWED_CUSTOM_FILL: 8,
} as const;

/** The radius of the area around a pip's origin that its glow and gradients cover, in its units. */
export const PIP_RADIUS = 100;

/** The radius of the glow behind a pip that a positive clue has confirmed, in the pip's units. */
const POSITIVE_PIP_HIGHLIGHT_RADIUS = PIP_RADIUS;

/** The center of that glow, offset slightly from the pip's origin to sit behind its artwork. */
const POSITIVE_PIP_HIGHLIGHT_CENTER = {
  x: 3,
  y: 5,
} as const;

/**
 * How far right the bottom of a multi-color duplicate-pip ring's gradient is from its top, in the
 * pip's units, so that its stripes slant.
 */
const DUPLICATE_PIP_RING_GRADIENT_SLANT = 30;

/**
 * A pip that repeats an earlier suit's pip shrinks by this factor and sits inside a ring, so that
 * the two suits can be told apart.
 */
const DUPLICATE_PIP_SCALE = 0.8;

/** The inner and outer radii of the ring around a duplicate pip, in the pip's units. */
const DUPLICATE_PIP_RING_RADIUS = {
  INNER: 80,
  OUTER: 90,
} as const;

/**
 * Returns where a suit's pip sits in the ring of suit pips, relative to the middle of the card and
 * before scaling. The suits go counterclockwise from the top.
 */
export function getSuitPipRingPosition(
  suitIndex: number,
  numSuits: number,
): { x: number; y: number } {
  const angle =
    (SUIT_PIP_RING_START_TURNS - suitIndex / numSuits) * FULL_CIRCLE_RADIANS;
  return {
    x: -Math.floor(SUIT_PIP_RING_RADIUS * Math.cos(angle)),
    y: -Math.floor(SUIT_PIP_RING_RADIUS * Math.sin(angle)),
  };
}

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
    ctx.arc(
      POSITIVE_PIP_HIGHLIGHT_CENTER.x,
      POSITIVE_PIP_HIGHLIGHT_CENTER.y,
      POSITIVE_PIP_HIGHLIGHT_RADIUS,
      0,
      FULL_CIRCLE_RADIANS,
    );
    ctx.fillStyle = POSITIVE_PIP_HIGHLIGHT_COLOR;
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
    ctx.shadowColor = CARD_IMAGE_SHADOW_COLOR;
  }

  const hasCustomFill = customFill !== undefined;

  // In some variants, there can be two suits with the same pip, like "Rainbow & Muddy Rainbow". To
  // disambiguate the suits, we draw a circle around the second suit that has the same pip.
  const previousPips = variant.pips.slice(0, suitIndex);
  const isDuplicatePip = previousPips.includes(pip);
  if (isDuplicatePip) {
    ctx.scale(DUPLICATE_PIP_SCALE, DUPLICATE_PIP_SCALE);

    const { INNER, OUTER } = DUPLICATE_PIP_RING_RADIUS;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, INNER, INNER, 0, 0, FULL_CIRCLE_RADIANS);
    ctx.moveTo(OUTER, 0);
    ctx.ellipse(0, 0, OUTER, OUTER, 0, 0, FULL_CIRCLE_RADIANS);

    if (hasCustomFill) {
      ctx.fillStyle = customFill!;
    } else if (suit.fillColors === undefined) {
      ctx.fillStyle = suit.fill;
    } else {
      const colors = suit.fillColors;
      const grad = ctx.createLinearGradient(
        0,
        -PIP_RADIUS,
        DUPLICATE_PIP_RING_GRADIENT_SLANT,
        PIP_RADIUS,
      );
      for (const [i, color] of colors.entries()) {
        grad.addColorStop(i / (colors.length - 1), color);
      }
      ctx.fillStyle = grad;
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
  } else if (suit.fillColors === undefined) {
    // Most suits have a solid fill.
    const fill = suit.name === BLACK_SUIT_NAME ? BLACK_PIP_FILL : suit.fill;
    ctx.fillStyle = fill;
    drawPipFunction(ctx);
    ctx.fill();
  } else {
    // Rainbow and omni cards have a multiple color fill which is passed as an array to the drawing
    // function; the drawing function will handle the filling.
    drawPipFunction(ctx, suit.fillColors);
  }

  // Draw a black border around the shape.
  if (shadow === true) {
    ctx.lineWidth =
      lineWidth
      ?? (hasCustomFill
        ? PIP_BORDER_WIDTH.SHADOWED_CUSTOM_FILL
        : PIP_BORDER_WIDTH.SHADOWED);
    ctx.shadowColor = NO_SHADOW_COLOR;
  } else {
    ctx.lineWidth = PIP_BORDER_WIDTH.PLAIN;
  }
  ctx.stroke();
}
