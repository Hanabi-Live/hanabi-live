// Initialization functions for the HanabiCard object.

import type {
  PossibilityRowPresentation,
  Rank,
  Suit,
  Variant,
} from "@hanabi-live/game";
import {
  DEFAULT_CARD_RANKS,
  PipState,
  START_CARD_RANK,
  hasReversedSuits,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import type * as KonvaUtil from "konva/lib/Util";
import type { RectConfig } from "konva/lib/shapes/Rect";
import { START_CARD_RANK_LABEL } from "../../constants.ts";
import type { Pips } from "../types/Pips.ts";
import { globals } from "./UiGlobals.ts";
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
  NO_SHADOW_COLOR,
  OFF_BLACK,
  RANK_FONT_FAMILY,
  SMALL_ICON_SIZE,
  TEXT_SHADOW,
  TOP_LEFT_X,
  TOP_LEFT_Y,
} from "./constants.ts";
import { NoteIndicator } from "./controls/NoteIndicator.ts";
import { CANVAS_DEFAULT_MITER_LIMIT, RankPip } from "./controls/RankPip.ts";
import { drawWithKonva3Shadow } from "./controls/konva3Shadow.ts";
import { outlinedArrow } from "./controls/outlinedArrow.ts";
import {
  PIP_RADIUS,
  SUIT_PIP_SCALE,
  drawPip,
  getSuitPipRingPosition,
} from "./drawPip.ts";

/** The opacity of the shadow under a card and under the pips drawn on it. */
const CARD_SHADOW_OPACITY = 0.4;

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

/**
 * The opacity of the ghost drawn over a card, so that the pips under it stay visible. It matches
 * the trash can, whose image is half transparent.
 */
const GHOST_OPACITY = 0.5;

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
    image: undefined,
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

/** The outline around a rank pip's digit. */
const RANK_PIP_OUTLINE_WIDTH = 3;

/** The drop shadow under a rank pip, which is omitted in speedrun games. */
const RANK_PIP_SHADOW = {
  shadowColor: "black",
  shadowOffsetX: 5,
  shadowOffsetY: 5,
  shadowOpacity: CARD_SHADOW_OPACITY,
  shadowForStrokeEnabled: true,
} as const;

/** The outline around a suit pip. */
const SUIT_PIP_STROKE_WIDTH = 5;

/** The drop shadow under a suit pip, which is omitted in speedrun games. */
const SUIT_PIP_SHADOW = {
  shadowColor: "black",
  shadowOffsetX: 15,
  shadowOffsetY: 15,
  shadowOpacity: CARD_SHADOW_OPACITY,
  shadowForStrokeEnabled: true,
} as const;

/** The size of the X over a suit pip that has been ruled out, in the pip's units. */
const SUIT_PIP_X_SIZE = 50;

/** The size of the X over a rank pip that has been ruled out. */
const RANK_PIP_X_SIZE = 13;

/**
 * The center of the X over a rank pip that has been ruled out, relative to the top-left corner of
 * the pip's box. The digit is larger than its box, so its middle is below the middle of the box. It
 * has always been drawn half a pixel right of the middle of the box.
 */
const RANK_PIP_X_CENTER = { x: (RANK_PIP_SIZE + 1) / 2, y: 27 } as const;

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

/**
 * The possibility rows, which replace the suit and rank pips when the clues leave a set of cards
 * that they cannot show. Each row has suit pips on the left and the ranks those suits can be on the
 * right, with each rank always in the same column.
 */
const POSSIBILITY_ROWS = {
  /** The height that the rows share, centered on the card, as a fraction of the card height. */
  areaH: 0.94,
  /** The height of a row when there are only a few, as a fraction of the card height. */
  maxRowH: 1 / 3,
  /** The space for the suit pips, as fractions of the card width. */
  suitsX: { start: 0.03, end: 0.27 },
  /** The suit pips of a row go in a grid with up to this many columns. */
  maxSuitColumns: 2,
  /**
   * The space for the rank columns, as fractions of the card width. Each rank gets an equal share
   * of it.
   */
  ranksX: { start: 0.29, end: 0.94 },
  /** The radius of a suit pip, as a fraction of the smaller side of its cell in the grid. */
  pipRadiusPerCell: 0.48,
  /** The size of a rank's digit, as a fraction of the row height. */
  fontSizePerRowH: 0.7,
  /**
   * The width of a rank column that a digit needs, as a fraction of its font size. A bold Arial
   * digit is 0.556 of the font size wide, and the rest keeps the outlines of two digits apart.
   */
  columnWidthPerFontSize: 0.62,
  /** Arial's digits sit slightly high when centered on a point, so move them down this much. */
  digitDropPerFontSize: 0.04,
  /** The line between two rows. */
  divider: { width: 2, color: "rgba(0, 0, 0, 0.22)" },
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
): { arrow: Konva.Group; arrowBase: Konva.Shape } | undefined {
  if (!hasReversedSuits(variant)) {
    return undefined;
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

  const arrowBase = outlinedArrow({
    points: [0, 0, 0, DIRECTION_ARROW.h],
    pointerLength,
    pointerWidth,
    bodyWidth: pointerLength * ARROW_STROKE_WIDTH.BODY,
    outlineWidth: pointerLength * ARROW_STROKE_WIDTH.OUTLINE,
    fill: "white", // This should match the color of the suit; it will be manually set later on
    listening: false,
  });
  arrow.add(arrowBase);

  return { arrow, arrowBase };
}

// Cache the pip objects to save time on the multiple cards.
let cachedVariant: Variant | undefined;
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
      fill: "white",
      stroke: "black",
      strokeWidth: RANK_PIP_OUTLINE_WIDTH,
      shadowEnabled: !globals.options.speedrun,
      ...RANK_PIP_SHADOW,
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
 * Creates the shape that draws a card's possibility rows. It draws them all in one shape, rather
 * than one shape for each pip, because a card can have up to six rows of pips.
 */
export function possibilityRows(
  variant: Variant,
  getRows: () => readonly PossibilityRowPresentation[] | undefined,
): Konva.Shape {
  // The start card's rank comes first, as it does in the rank pips.
  const rankColumns = [...variant.ranks].toSorted(
    (a, b) => rankColumnOrder(a) - rankColumnOrder(b),
  );

  return new Konva.Shape({
    visible: false,
    shadowEnabled: !globals.options.speedrun,
    ...RANK_PIP_SHADOW,
    listening: false,
    sceneFunc: (ctx: KonvaContext.Context, shape: Konva.Shape) => {
      const rows = getRows();
      if (rows === undefined) {
        return;
      }

      drawWithKonva3Shadow(shape, ctx, () => {
        drawPossibilityRows(ctx, variant, rankColumns, rows);
      });
    },
  });
}

function rankColumnOrder(rank: Rank): number {
  return rank === START_CARD_RANK ? 0 : rank;
}

interface PossibilityRowLayout {
  readonly row: PossibilityRowPresentation;
  readonly centerY: number;
  readonly pipScale: number;
  readonly suitCenters: ReadonlyArray<{ x: number; y: number }>;
}

function getPossibilityRowLayouts(
  rows: readonly PossibilityRowPresentation[],
): { rowH: number; top: number; layouts: readonly PossibilityRowLayout[] } {
  const { suitsX } = POSSIBILITY_ROWS;
  const rowH = Math.min(
    POSSIBILITY_ROWS.maxRowH * CARD_H,
    (POSSIBILITY_ROWS.areaH * CARD_H) / rows.length,
  );
  const top = (CARD_H - rowH * rows.length) / 2;
  const layouts = rows.map((row, rowIndex) => {
    const centerY = top + rowH * (rowIndex + 0.5);
    const numSuits = row.suitPips.length;
    const columns = Math.min(numSuits, POSSIBILITY_ROWS.maxSuitColumns);
    const lines = Math.ceil(numSuits / columns);
    const cellW = ((suitsX.end - suitsX.start) * CARD_W) / columns;
    const cellH = rowH / lines;
    const pipRadius =
      Math.min(cellW, cellH) * POSSIBILITY_ROWS.pipRadiusPerCell;
    return {
      row,
      centerY,
      pipScale: pipRadius / PIP_RADIUS,
      suitCenters: row.suitPips.map((_, i) => {
        // Center a last line that is not full.
        const line = Math.floor(i / columns);
        const lineColumns = Math.min(columns, numSuits - line * columns);
        const lineStartX =
          suitsX.start * CARD_W + (cellW * (columns - lineColumns)) / 2;
        return {
          x: lineStartX + cellW * ((i % columns) + 0.5),
          y: centerY - rowH / 2 + cellH * (line + 0.5),
        };
      }),
    };
  });

  return { rowH, top, layouts };
}

function drawPossibilityRows(
  ctx: KonvaContext.Context,
  variant: Variant,
  rankColumns: readonly Rank[],
  rows: readonly PossibilityRowPresentation[],
) {
  const { suitsX, ranksX } = POSSIBILITY_ROWS;
  const { rowH, top, layouts } = getPossibilityRowLayouts(rows);
  const columnW = ((ranksX.end - ranksX.start) * CARD_W) / rankColumns.length;
  const fontSize = Math.min(
    rowH * POSSIBILITY_ROWS.fontSizePerRowH,
    columnW / POSSIBILITY_ROWS.columnWidthPerFontSize,
    RANK_PIP_FONT_SIZE,
  );
  const digitDrop = fontSize * POSSIBILITY_ROWS.digitDropPerFontSize;
  const columnX = new Map(
    rankColumns.map((rank, i) => [
      rank,
      ranksX.start * CARD_W + columnW * (i + 0.5),
    ]),
  );

  // First, the suit pips and the digits, which cast shadows.
  for (const { row, centerY, pipScale, suitCenters } of layouts) {
    for (const [i, suitPip] of row.suitPips.entries()) {
      const suit = variant.suits[suitPip.suitIndex];
      const center = suitCenters[i];
      assertDefined(suit, `Failed to find suit: ${suitPip.suitIndex}`);
      assertDefined(center, `Failed to find the center of suit pip: ${i}`);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.scale(pipScale, pipScale);
      ctx.setAttr("strokeStyle", "black");
      drawPip(
        ctx as unknown as CanvasRenderingContext2D,
        suit,
        variant,
        false,
        undefined,
        undefined,
        suitPip.positive,
      );
      ctx.restore();
    }

    for (const rankPip of row.rankPips) {
      if (rankPip.state === PipState.Hidden) {
        continue;
      }

      const x = columnX.get(rankPip.rank) ?? 0;
      const y = centerY + digitDrop;
      const text =
        rankPip.rank === START_CARD_RANK
          ? START_CARD_RANK_LABEL.toLowerCase()
          : rankPip.rank.toString();
      ctx.save();
      ctx.setAttr("font", `bold ${fontSize}px ${RANK_FONT_FAMILY}`);
      ctx.setAttr("textAlign", "center");
      ctx.setAttr("textBaseline", "middle");
      ctx.setAttr("fillStyle", rankPip.positive ? CLUED_COLOR : "white");
      ctx.fillText(text, x, y);
      ctx.setAttr("strokeStyle", "black");
      ctx.setAttr("lineWidth", RANK_PIP_OUTLINE_WIDTH);
      ctx.setAttr("miterLimit", CANVAS_DEFAULT_MITER_LIMIT);
      ctx.strokeText(text, x, y);
      ctx.restore();
    }
  }

  // Then the dividers and the X over each ruled-out pip, which do not.
  ctx.setAttr("shadowColor", NO_SHADOW_COLOR);
  for (const [rowIndex, layout] of layouts.entries()) {
    const { row, centerY, pipScale, suitCenters } = layout;
    if (rowIndex > 0) {
      const y = top + rowH * rowIndex;
      ctx.beginPath();
      ctx.moveTo(suitsX.start * CARD_W, y);
      ctx.lineTo((1 - suitsX.start) * CARD_W, y);
      ctx.setAttr("strokeStyle", POSSIBILITY_ROWS.divider.color);
      ctx.setAttr("lineWidth", POSSIBILITY_ROWS.divider.width);
      ctx.stroke();
    }

    for (const [i, suitPip] of row.suitPips.entries()) {
      const center = suitCenters[i];
      if (suitPip.state === PipState.Eliminated && center !== undefined) {
        drawCenteredX(
          ctx,
          center,
          SUIT_PIP_X_SIZE * pipScale,
          { fill: "black", stroke: "white" },
          PIP_OUTLINE_WIDTH * pipScale,
        );
      }
    }

    for (const rankPip of row.rankPips) {
      if (rankPip.state === PipState.Eliminated) {
        drawCenteredX(
          ctx,
          { x: columnX.get(rankPip.rank) ?? 0, y: centerY + digitDrop },
          (RANK_PIP_X_SIZE * fontSize) / RANK_PIP_FONT_SIZE,
          { fill: "black", stroke: "black" },
          RANK_PIP_X_STROKE_WIDTH,
        );
      }
    }
  }
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
    identitySourceImage: globals.imageLoader!.get("note-pencil"),
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    rotation: HALF_TURN_DEGREES,
    shadowEnabled: !globals.options.speedrun,
    ...TEXT_SHADOW,
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
    shadowEnabled: !globals.options.speedrun,
    ...TEXT_SHADOW,
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
    opacity: GHOST_OPACITY,
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

/** Traces the outline of an X. Its center is half of `width` right of `positionX`. */
function traceX(
  ctx: KonvaContext.Context,
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
}

function drawX(
  ctx: KonvaContext.Context,
  shape: Konva.Shape,
  positionX: number,
  positionY: number,
  size: number,
  width: number,
) {
  traceX(ctx, positionX, positionY, size, width);
  ctx.stroke();
  ctx.closePath();
  ctx.fillStrokeShape(shape);
}

/** Draws a filled, outlined X centered on a point, without a Konva shape to style it. */
function drawCenteredX(
  ctx: KonvaContext.Context,
  center: { x: number; y: number },
  size: number,
  colors: { fill: string; stroke: string },
  strokeWidth: number,
) {
  traceX(ctx, center.x - size / 2, center.y, size, size);
  ctx.closePath();
  ctx.setAttr("fillStyle", colors.fill);
  ctx.fill();
  ctx.setAttr("strokeStyle", colors.stroke);
  ctx.setAttr("lineWidth", strokeWidth);
  ctx.stroke();
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
    shadowEnabled: !globals.options.speedrun,
    ...SUIT_PIP_SHADOW,
    sceneFunc: (ctx: KonvaContext.Context, shape: Konva.Shape) => {
      drawWithKonva3Shadow(shape, ctx, () => {
        drawPip(
          ctx as unknown as CanvasRenderingContext2D,
          suit,
          variant,
          false,
          undefined,
          undefined,
          isPositive,
        );
      });
    },
    listening: false,
  });
}
