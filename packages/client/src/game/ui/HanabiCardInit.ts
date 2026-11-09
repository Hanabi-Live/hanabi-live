// Initialization functions for the HanabiCard object.

import type { Suit, Variant } from "@hanabi-live/game";
import {
  DEFAULT_CARD_RANKS,
  START_CARD_RANK,
  hasReversedSuits,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import Konva from "konva";
import type * as KonvaContext from "konva/types/Context";
import type * as KonvaUtil from "konva/types/Util";
import type { Arrow } from "konva/types/shapes/Arrow";
import type { RectConfig } from "konva/types/shapes/Rect";
import { START_CARD_RANK_LABEL } from "../../constants";
import type { Pips } from "../types/Pips";
import { globals } from "./UIGlobals";
import {
  ARROW_STROKE_WIDTH,
  BOTTOM_LEFT_X,
  BOTTOM_LEFT_Y,
  CARD_CENTER,
  CARD_H,
  CARD_SHADOW_OFFSET,
  CARD_W,
  CHOP_MOVE_COLOR,
  CLUED_COLOR,
  CORNER_ELEMENT_OFFSET,
  DISCARD_PERMISSION_COLOR,
  FINESSE_COLOR,
  HALF_TURN_DEGREES,
  OFF_BLACK,
  RANK_FONT_FAMILY,
  SMALL_ICON_SIZE,
  TOP_LEFT_X,
  TOP_LEFT_Y,
} from "./constants";
import { NoteIndicator } from "./controls/NoteIndicator";
import { RankPip } from "./controls/RankPip";
import { SUIT_PIP_SCALE, drawPip, getSuitPipRingPosition } from "./drawPip";

/** The opacity of the shadow under a card. */
const CARD_SHADOW_OPACITY = 0.4;

/** The fill of an unclued rank pip, gray so that the pips do not stand out from the card. */
const RANK_PIP_COLOR = "#ebebeb";

/**
 * The size of the large icons drawn over the middle of a card, such as a question mark. Based on
 * the card's width, but used for both the icon's width and height.
 */
const LARGE_ICON_SIZE = 0.8 * CARD_W;

/** The left edge of most of the large icons drawn over the middle of a card. */
const LARGE_ICON_X = 0.15 * CARD_W;

/** The left edge of a large icon that is centered horizontally on a card. */
const LARGE_ICON_CENTERED_X = (CARD_W - LARGE_ICON_SIZE) / 2;

/** The top edge of the large icons drawn over the middle of a card. */
const LARGE_ICON_Y = 0.2 * CARD_H;

/** The size of the trash can drawn over a card that can no longer be played. */
const TRASHCAN_SIZE = { w: 0.7 * CARD_W, h: 0.6 * CARD_H } as const;

/** The top edge of the wrench drawn over a card, which sits lower than the other large icons. */
const WRENCH_Y = 0.33 * CARD_H;

/** The top-left corner of the note indicator, as fractions of the card size. */
const NOTE_INDICATOR_POSITION = { x: 0.78, y: 0.03 } as const;

/**
 * The arrow on a card of a reversed suit, which points up or down to show the direction that the
 * suit is played in.
 */
const DIRECTION_ARROW = {
  /** The horizontal position of the arrow's shaft, near the right edge of the card. */
  x: 0.815 * CARD_W,
  /** How far above its group's origin the arrow starts. */
  offsetY: 0.14 * CARD_H,
  /** The length of the arrow. */
  h: 0.25 * CARD_H,
  /** The length of the arrowhead, which also sets the thickness of its strokes. */
  pointerLength: 0.05 * CARD_W,
  /** How much wider the arrowhead is than it is long. */
  pointerWidthRatio: 1.5,
} as const;

export function image(getBareName: () => string): Konva.Image {
  // Create the "bare" card image, which is the main card graphic. If the card is not revealed, it
  // will just be a gray rounded rectangle. The pips and other elements of a card are drawn on top
  // of the bare image.
  const bare = new Konva.Image({
    width: CARD_W,
    height: CARD_H,
    image: null as unknown as ImageBitmapSource,
    shadowEnabled: false,
    shadowColor: "black",
    shadowOffset: {
      x: CARD_SHADOW_OFFSET,
      y: CARD_SHADOW_OFFSET,
    },
    shadowOpacity: CARD_SHADOW_OPACITY,
    listening: true, // As the main card element, this must be listening in order for events to fire
  });
  (bare as Konva.Shape).sceneFunc((ctx: KonvaContext.Context) => {
    scaleCardImage(
      ctx._context,
      getBareName(),
      bare.width(),
      bare.height(),
      bare.getAbsoluteTransform(),
    );
  });
  return bare;
}

const BORDER_CORNER_RADIUS = 6;
const BORDER_STROKE_WIDTH = 20;
const BORDER_STROKE_WIDTH_INSIDE = BORDER_STROKE_WIDTH * 0.6;
const BORDER_OFFSET = 2;
const BORDER_OUTSIDE_COLOR = OFF_BLACK;

/** The width and height of the box that each rank pip is centered in. */
const RANK_PIP_SIZE = Math.floor(CARD_H * 0.1);

/** The rank pip's digits are larger than its box so that they are easy to read. */
const RANK_PIP_FONT_SIZE = 63;

/**
 * The outline around the X over a suit pip that has been ruled out, which keeps it readable on any
 * card. It is drawn centered on the edge, so this is twice its visible width.
 */
const PIP_OUTLINE_WIDTH = 6;

/**
 * The outline around a rank pip's digit. The fill covers its inner half, so this is twice its
 * visible width. At hand size, a thinner outline is narrower than a screen pixel and fades in and
 * out depending on where the digit lands on the pixel grid.
 */
const RANK_PIP_OUTLINE_WIDTH = 8;

/** The outline around a suit pip. */
const SUIT_PIP_STROKE_WIDTH = 5;

/** The size of the X over a suit pip that has been ruled out, in the pip's units. */
const SUIT_PIP_X_SIZE = 50;

/** The size of the X over a rank pip that has been ruled out. */
const RANK_PIP_X_SIZE = 13;

/**
 * The center of the X over a rank pip that has been ruled out, relative to the top-left corner of
 * the pip's box. The digit is larger than its box, so its middle is below the middle of the box.
 */
const RANK_PIP_X_CENTER = { x: RANK_PIP_SIZE / 2, y: 27 } as const;

/** The row of rank pips along the bottom of a card, as fractions of the card height. */
const RANK_PIP_ROW = { y: 0.81, h: 0.15 } as const;

/** The outline around the X over a rank pip that has been ruled out. */
const RANK_PIP_X_STROKE_WIDTH = 2;

/**
 * Where the rank pips go along the bottom of a card, as fractions of the card width. The pips of a
 * variant with the usual five ranks are spread further apart than those of a variant with a start
 * card.
 */
const RANK_PIP_X = {
  defaultRanks: { start: -0.14, spacing: 0.19 },
  otherRanks: { start: 0.05, spacing: 0.15 },
} as const;

function makeBorder(color: string) {
  const border = new Konva.Group({
    visible: false,
    listening: false,
  });

  const borderOutside = new Konva.Rect(
    getBorderConfig(BORDER_STROKE_WIDTH, BORDER_OUTSIDE_COLOR),
  );
  const borderInside = new Konva.Rect(
    getBorderConfig(BORDER_STROKE_WIDTH_INSIDE, color),
  );

  border.add(borderOutside);
  border.add(borderInside);

  return border;
}

function getBorderConfig(strokeWidth: number, stroke: string): RectConfig {
  return {
    width: CARD_W - BORDER_OFFSET,
    height: CARD_H - BORDER_OFFSET,
    cornerRadius: BORDER_CORNER_RADIUS,
    strokeWidth,
    stroke,
    listening: false,
  };
}

export function cluedBorder(): Konva.Group {
  return makeBorder(CLUED_COLOR);
}

export function chopMoveBorder(): Konva.Group {
  return makeBorder(CHOP_MOVE_COLOR);
}

export function finesseBorder(): Konva.Group {
  return makeBorder(FINESSE_COLOR);
}

export function discardPermissionBorder(): Konva.Group {
  return makeBorder(DISCARD_PERMISSION_COLOR);
}

export function directionArrow(
  variant: Variant,
): { arrow: Konva.Group; arrowBase: Arrow } | null {
  if (!hasReversedSuits(variant)) {
    return null;
  }

  const arrow = new Konva.Group({
    x: DIRECTION_ARROW.x,
    visible: false,
    offset: {
      x: 0,
      y: DIRECTION_ARROW.offsetY,
    },
    listening: false,
  });

  const { pointerLength } = DIRECTION_ARROW;
  const pointerWidth = pointerLength * DIRECTION_ARROW.pointerWidthRatio;

  const border = new Konva.Arrow({
    points: [0, 0, 0, DIRECTION_ARROW.h],
    pointerLength,
    pointerWidth,
    fill: "black",
    stroke: "black",
    strokeWidth: pointerLength * ARROW_STROKE_WIDTH.OUTLINE,
    listening: false,
  });
  arrow.add(border);

  const edge = new Konva.Line({
    points: [-pointerLength, 0, pointerLength, 0],
    fill: "black",
    stroke: "black",
    strokeWidth: pointerLength * ARROW_STROKE_WIDTH.EDGE,
    listening: false,
  });
  arrow.add(edge);

  const arrowBase = new Konva.Arrow({
    points: [0, 0, 0, DIRECTION_ARROW.h],
    pointerLength,
    pointerWidth,
    fill: "white",
    stroke: "white", // This should match the color of the suit; it will be manually set later on
    strokeWidth: pointerLength * ARROW_STROKE_WIDTH.BODY,
    listening: false,
  });
  arrow.add(arrowBase);

  return { arrow, arrowBase };
}

// Cache the pip objects to save time on the multiple cards.
let cachedVariant: Variant | null = null;
let cachedPips: {
  suitPipsMap: Map<number, Konva.Shape>;
  suitPipsPositiveMap: Map<number, Konva.Shape>;
  suitPipsXMap: Map<number, Konva.Shape>;
  rankPipsMap: Map<number, RankPip>;
  rankPipsXMap: Map<number, Konva.Shape>;
};

/**
 * Initialize the suit pips (colored shapes) on the back of the card, which will be removed one by
 * one as the card gains negative information. For each pip also create the one with positive
 * information.
 */
function makeCachedPips(variant: Variant) {
  const suitPipsMap = new Map<number, Konva.Shape>();
  const suitPipsPositiveMap = new Map<number, Konva.Shape>();
  const suitPipsXMap = new Map<number, Konva.Shape>();

  for (const [suitIndex, suit] of variant.suits.entries()) {
    // Set the pip at the middle of the card.
    const { x, y } = CARD_CENTER;

    const scale = {
      x: SUIT_PIP_SCALE,
      y: SUIT_PIP_SCALE,
    };

    // A Konva offset moves the shape in the opposite direction.
    const position = getSuitPipRingPosition(suitIndex, variant.suits.length);
    const offset = {
      x: -position.x,
      y: -position.y,
    };

    const suitPip = getNewColorPip(x, y, scale, offset, suit, variant, false);
    const suitPipPositive = getNewColorPip(
      x,
      y,
      scale,
      offset,
      suit,
      variant,
      true,
    );
    suitPipsMap.set(suitIndex, suitPip);
    suitPipsPositiveMap.set(suitIndex, suitPipPositive);

    /** The X that will show when a certain suit can be ruled out. */
    const suitPipX = new Konva.Shape({
      x,
      y,
      scale,
      offset,
      fill: "black",
      stroke: "white",
      strokeWidth: PIP_OUTLINE_WIDTH,
      opacity: 1,
      visible: false,
      sceneFunc: (ctx, shape) => {
        // Center the X on the pip.
        drawX(
          ctx,
          shape,
          -SUIT_PIP_X_SIZE / 2,
          0,
          SUIT_PIP_X_SIZE,
          SUIT_PIP_X_SIZE,
        );
      },
      listening: false,
    });
    suitPipsXMap.set(suitIndex, suitPipX);
  }

  // Initialize the rank pips (along the bottom of the card).
  const rankPipsMap = new Map<number, RankPip>();
  const rankPipsXMap = new Map<number, Konva.Shape>();
  for (const rank of variant.ranks) {
    const x =
      variant.ranks.length === DEFAULT_CARD_RANKS.length
        ? Math.floor(
            CARD_W
              * (rank * RANK_PIP_X.defaultRanks.spacing
                + RANK_PIP_X.defaultRanks.start),
          )
        : Math.floor(
            CARD_W
              * ((rank === START_CARD_RANK ? 0 : rank)
                * RANK_PIP_X.otherRanks.spacing
                + RANK_PIP_X.otherRanks.start),
          );
    const y = 0;
    const rankPip = new RankPip({
      x,
      y,
      fontFamily: RANK_FONT_FAMILY,
      fontStyle: "bold",
      fontSize: RANK_PIP_FONT_SIZE,
      align: "center",
      text:
        rank === START_CARD_RANK
          ? START_CARD_RANK_LABEL.toLowerCase()
          : rank.toString(),
      // Konva draws nothing when a glyph is wider than its box, which happens with fonts wider than
      // Arial. Leave room for them, offset so that the digit stays centered on the same spot.
      width: RANK_PIP_SIZE * 2,
      offsetX: RANK_PIP_SIZE / 2,
      height: RANK_PIP_SIZE,
      fill: RANK_PIP_COLOR,
      stroke: "black",
      strokeWidth: RANK_PIP_OUTLINE_WIDTH,
      listening: false,
    });
    rankPipsMap.set(rank, rankPip);

    /** The X that will show when a certain rank can be ruled out. */
    const rankPipX = new Konva.Shape({
      x,
      y: 0,
      fill: "black",
      stroke: "black",
      strokeWidth: RANK_PIP_X_STROKE_WIDTH,
      opacity: 1,
      visible: false,
      sceneFunc: (ctx, shape) => {
        drawX(
          ctx,
          shape,
          RANK_PIP_X_CENTER.x - RANK_PIP_X_SIZE / 2,
          RANK_PIP_X_CENTER.y,
          RANK_PIP_X_SIZE,
          RANK_PIP_X_SIZE,
        );
      },
      listening: false,
    });
    rankPipsXMap.set(rank, rankPipX);
  }

  // Cache the results
  cachedPips = {
    suitPipsMap,
    suitPipsPositiveMap,
    suitPipsXMap,
    rankPipsMap,
    rankPipsXMap,
  };

  cachedVariant = variant;
}

export function pips(variant: Variant): Pips {
  if (cachedVariant !== variant) {
    makeCachedPips(variant);
  }

  const suitPips = new Konva.Group({
    x: 0,
    y: 0,
    width: Math.floor(CARD_W),
    height: Math.floor(CARD_H),
    visible: false,
    listening: false,
  });

  const suitPipsMap = new Map<number, Konva.Shape>();
  const suitPipsPositiveMap = new Map<number, Konva.Shape>();
  const suitPipsXMap = new Map<number, Konva.Shape>();

  const rankPips = new Konva.Group({
    x: 0,
    y: Math.floor(CARD_H * RANK_PIP_ROW.y),
    width: CARD_W,
    height: Math.floor(CARD_H * RANK_PIP_ROW.h),
    visible: false,
    listening: false,
  });

  const rankPipsMap = new Map<number, RankPip>();
  const rankPipsXMap = new Map<number, Konva.Shape>();

  for (const suitIndex of variant.suits.keys()) {
    const suitPip = cachedPips.suitPipsMap
      .get(suitIndex)!
      .clone() as Konva.Shape;
    const suitPipPositive = cachedPips.suitPipsPositiveMap
      .get(suitIndex)!
      .clone() as Konva.Shape;
    const suitPipX = cachedPips.suitPipsXMap
      .get(suitIndex)!
      .clone() as Konva.Shape;
    suitPips.add(suitPip);
    suitPips.add(suitPipPositive);
    suitPips.add(suitPipX);
    suitPipsMap.set(suitIndex, suitPip);
    suitPipsPositiveMap.set(suitIndex, suitPipPositive);
    suitPipsXMap.set(suitIndex, suitPipX);
  }

  for (const rank of variant.ranks) {
    const rankPip = cachedPips.rankPipsMap.get(rank)!.clone() as RankPip;
    const rankPipX = cachedPips.rankPipsXMap.get(rank)!.clone() as Konva.Shape;
    rankPips.add(rankPip);
    rankPips.add(rankPipX);
    rankPipsMap.set(rank, rankPip);
    rankPipsXMap.set(rank, rankPipX);
  }

  return {
    suitPips,
    suitPipsMap,
    suitPipsPositiveMap,
    suitPipsXMap,
    rankPips,
    rankPipsMap,
    rankPipsXMap,
  };
}

/**
 * Returns where an indicator in the bottom-left corner of a card goes. If the card has triangles on
 * its corners that show the color composition, the images would overlap, so the indicator moves
 * upwards and inwards.
 */
function bottomLeftPosition(offsetCornerElements: boolean): {
  x: number;
  y: number;
} {
  const offset = offsetCornerElements ? CORNER_ELEMENT_OFFSET : 0;
  return {
    x: BOTTOM_LEFT_X + offset * CARD_W,
    y: BOTTOM_LEFT_Y - offset * CARD_H,
  };
}

export function note(
  offsetCornerElements: boolean,
  shouldShowIndicator: () => boolean,
): NoteIndicator {
  // Define the note indicator image.
  const noteIndicator = new NoteIndicator({
    // If the cards have triangles on the corners that show the color composition, the images will
    // overlap. Thus, we move it downwards if this is the case.
    x:
      (offsetCornerElements
        ? NOTE_INDICATOR_POSITION.x - CORNER_ELEMENT_OFFSET
        : NOTE_INDICATOR_POSITION.x) * CARD_W,
    y:
      (offsetCornerElements
        ? NOTE_INDICATOR_POSITION.y + CORNER_ELEMENT_OFFSET
        : NOTE_INDICATOR_POSITION.y) * CARD_H,
    align: "center",
    image: globals.imageLoader!.get("note"),
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    rotation: HALF_TURN_DEGREES,
    visible: shouldShowIndicator(),
    listening: false,
  });
  noteIndicator.scale({
    x: -1,
    y: -1,
  });

  return noteIndicator;
}

export function criticalIndicator(offsetCornerElements: boolean): Konva.Image {
  // Define the critical indicator image.
  const indicator = new Konva.Image({
    ...bottomLeftPosition(offsetCornerElements),
    align: "center",
    image: globals.imageLoader!.get("critical"),
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    rotation: HALF_TURN_DEGREES,
    visible: false,
    listening: false,
  });
  indicator.scale({
    x: -1,
    y: -1,
  });
  return indicator;
}

export function questionMark(): Konva.Image {
  return new Konva.Image({
    x: LARGE_ICON_X,
    y: LARGE_ICON_Y,
    width: LARGE_ICON_SIZE,
    height: LARGE_ICON_SIZE,
    image: globals.imageLoader!.get("question-mark2"),
    visible: false,
  });
}

export function exclamationMark(): Konva.Image {
  return new Konva.Image({
    x: LARGE_ICON_X,
    y: LARGE_ICON_Y,
    width: LARGE_ICON_SIZE,
    height: LARGE_ICON_SIZE,
    image: globals.imageLoader!.get("exclamation-mark"),
    visible: false,
  });
}

export function ghost(): Konva.Image {
  return new Konva.Image({
    x: LARGE_ICON_CENTERED_X,
    y: LARGE_ICON_Y,
    width: LARGE_ICON_SIZE,
    height: LARGE_ICON_SIZE,
    image: globals.imageLoader!.get("ghost"),
    visible: false,
  });
}

export function trashcan(): Konva.Image {
  return new Konva.Image({
    x: (CARD_W - TRASHCAN_SIZE.w) / 2,
    y: LARGE_ICON_Y,
    width: TRASHCAN_SIZE.w,
    height: TRASHCAN_SIZE.h,
    image: globals.imageLoader!.get("trashcan2"),
    visible: false,
  });
}

export function wrench(): Konva.Image {
  return new Konva.Image({
    x: LARGE_ICON_CENTERED_X,
    y: WRENCH_Y,
    width: LARGE_ICON_SIZE,
    image: globals.imageLoader!.get("wrench"),
    visible: false,
    listening: false,
  });
}

export function ddaIndicatorTop(): Konva.Image {
  return new Konva.Image({
    x: TOP_LEFT_X,
    y: TOP_LEFT_Y,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    image: globals.imageLoader!.get("dda"),
    visible: false,
    listening: false,
  });
}

export function ddaIndicatorBottom(offsetCornerElements: boolean): Konva.Image {
  const indicator = new Konva.Image({
    ...bottomLeftPosition(offsetCornerElements),
    align: "center",
    image: globals.imageLoader!.get("dda"),
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    visible: false,
    listening: false,
  });
  return indicator;
}

export function trashMiniIndicatorTop(): Konva.Image {
  return new Konva.Image({
    x: TOP_LEFT_X,
    y: TOP_LEFT_Y,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    image: globals.imageLoader!.get("wastebasket"),
    visible: false,
    listening: false,
  });
}

export function trashMiniIndicatorBottom(
  offsetCornerElements: boolean,
): Konva.Image {
  const indicator = new Konva.Image({
    ...bottomLeftPosition(offsetCornerElements),
    align: "center",
    image: globals.imageLoader!.get("wastebasket"),
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    visible: false,
    listening: false,
  });
  return indicator;
}

function scaleCardImage(
  ctx: CanvasRenderingContext2D,
  name: string,
  width: number,
  height: number,
  tf: KonvaUtil.Transform,
) {
  let src = globals.cardImages.get(name);
  assertDefined(src, `The image "${name}" was not generated.`);

  const dw = Math.hypot(tf.m[0]!, tf.m[1]!) * width;
  const dh = Math.hypot(tf.m[2]!, tf.m[3]!) * height;

  if (dw < 1 || dh < 1) {
    return;
  }

  let sw = width;
  let sh = height;
  let steps = 0;

  let scaledCardImages = globals.scaledCardImages.get(name);
  if (scaledCardImages === undefined) {
    scaledCardImages = [];
    globals.scaledCardImages.set(name, scaledCardImages);
  }

  // This code was written by Keldon; scaling the card down in steps of half in each dimension
  // presumably improves the scaling.
  while (dw < sw / 2) {
    let scaledCardImage = scaledCardImages[steps];

    sw = Math.floor(sw / 2);
    sh = Math.floor(sh / 2);

    if (scaledCardImage === undefined) {
      scaledCardImage = document.createElement("canvas");
      scaledCardImage.width = sw;
      scaledCardImage.height = sh;

      const scaleContext = scaledCardImage.getContext("2d");
      if (scaleContext === null) {
        throw new Error(
          "Failed to get the context for a new scaled card image.",
        );
      }

      scaleContext.drawImage(src, 0, 0, sw, sh);

      scaledCardImages[steps] = scaledCardImage;
    }

    src = scaledCardImage;
    steps++;
  }

  ctx.drawImage(src, 0, 0, width, height);
}

function drawX(
  ctx: KonvaContext.Context,
  shape: Konva.Shape,
  positionX: number,
  positionY: number,
  size: number,
  width: number,
) {
  let x = positionX;
  let y = positionY;
  // Start at the top left corner and draw an X.
  ctx.beginPath();
  x -= size;
  y -= size;
  ctx.moveTo(x, y);
  x += width / 2;
  y -= width / 2;
  ctx.lineTo(x, y);
  x += size;
  y += size;
  ctx.lineTo(x, y);
  x += size;
  y -= size;
  ctx.lineTo(x, y);
  x += width / 2;
  y += width / 2;
  ctx.lineTo(x, y);
  x -= size;
  y += size;
  ctx.lineTo(x, y);
  x += size;
  y += size;
  ctx.lineTo(x, y);
  x -= width / 2;
  y += width / 2;
  ctx.lineTo(x, y);
  x -= size;
  y -= size;
  ctx.lineTo(x, y);
  x -= size;
  y += size;
  ctx.lineTo(x, y);
  x -= width / 2;
  y -= width / 2;
  ctx.lineTo(x, y);
  x += size;
  y -= size;
  ctx.lineTo(x, y);
  x -= size;
  y -= size;
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.closePath();
  ctx.fillStrokeShape(shape);
}

function getNewColorPip(
  x: number,
  y: number,
  scale: { x: number; y: number },
  offset: { x: number; y: number },
  suit: Suit,
  variant: Variant,
  isPositive: boolean,
): Konva.Shape {
  return new Konva.Shape({
    x,
    y,
    scale,
    offset,
    stroke: "black",
    strokeWidth: SUIT_PIP_STROKE_WIDTH,
    sceneFunc: (ctx: KonvaContext.Context) => {
      drawPip(
        ctx as unknown as CanvasRenderingContext2D,
        suit,
        variant,
        false,
        undefined,
        undefined,
        isPositive,
      );
    },
    listening: false,
  });
}
