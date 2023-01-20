// Initialization functions for the HanabiCard object.

import { START_CARD_RANK, Suit, Variant } from "@hanabi/data";
import Konva from "konva";
import * as KonvaContext from "konva/types/Context";
import { Arrow } from "konva/types/shapes/Arrow";
import { RectConfig } from "konva/types/shapes/Rect";
import * as KonvaUtil from "konva/types/Util";
import * as variantRules from "../rules/variant";
import { Pips } from "../types/Pips";
import {
  BOTTOM_LEFT_X,
  BOTTOM_LEFT_Y,
  CARD_H,
  CARD_W,
  CHOP_MOVE_COLOR,
  CLUED_COLOR,
  FINESSE_COLOR,
  OFF_BLACK,
  SMALL_ICON_SIZE,
  TOP_LEFT_X,
  TOP_LEFT_Y,
} from "./constants";
import { NoteIndicator } from "./controls/NoteIndicator";
import { RankPip } from "./controls/RankPip";
import { drawPip } from "./drawPip";
import { globals } from "./globals";

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
      x: Math.floor(0.04 * CARD_W),
      y: Math.floor(0.04 * CARD_W),
    },
    shadowOpacity: 0.4,
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

const borderCornerRadius = 6;
const borderStrokeWidth = 20;
const borderStrokeWidthInside = borderStrokeWidth * 0.6;
const borderOffset = 2;
const borderOutsideColor = OFF_BLACK;

function makeBorder(color: string) {
  const border = new Konva.Group({
    visible: false,
    listening: false,
  });

  const borderConfig = (strokeWidth: number, stroke: string): RectConfig => ({
    width: CARD_W - borderOffset,
    height: CARD_H - borderOffset,
    cornerRadius: borderCornerRadius,
    strokeWidth,
    stroke,
    listening: false,
  });

  const borderOutside = new Konva.Rect(
    borderConfig(borderStrokeWidth, borderOutsideColor),
  );
  const borderInside = new Konva.Rect(
    borderConfig(borderStrokeWidthInside, color),
  );

  border.add(borderOutside);
  border.add(borderInside);

  return border;
}

export const cluedBorder = (): Konva.Group => makeBorder(CLUED_COLOR);
export const chopMoveBorder = (): Konva.Group => makeBorder(CHOP_MOVE_COLOR);
export const finesseBorder = (): Konva.Group => makeBorder(FINESSE_COLOR);

export function directionArrow(
  variant: Variant,
): { arrow: Konva.Group; arrowBase: Arrow } | null {
  if (!variantRules.hasReversedSuits(variant)) {
    return null;
  }

  const arrow = new Konva.Group({
    x: 0.815 * CARD_W,
    visible: false,
    offset: {
      x: 0,
      y: 0.14 * CARD_H,
    },
    listening: false,
  });

  const arrowHeight = 0.25;
  const pointerLength = 0.05 * CARD_W;

  const border = new Konva.Arrow({
    points: [0, 0, 0, arrowHeight * CARD_H],
    pointerLength,
    pointerWidth: pointerLength * 1.5,
    fill: "black",
    stroke: "black",
    strokeWidth: pointerLength * 2,
    listening: false,
  });
  arrow.add(border);

  const edge = new Konva.Line({
    points: [0 - pointerLength, 0, 0 + pointerLength, 0],
    fill: "black",
    stroke: "black",
    strokeWidth: pointerLength * 0.75,
    listening: false,
  });
  arrow.add(edge);

  const arrowBase = new Konva.Arrow({
    points: [0, 0, 0, arrowHeight * CARD_H],
    pointerLength,
    pointerWidth: pointerLength * 1.5,
    fill: "white",
    stroke: "white", // This should match the color of the suit; it will be manually set later on
    strokeWidth: pointerLength * 1.25,
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

function makeCachedPips(variant: Variant) {
  // Initialize the suit pips (colored shapes) on the back of the card, which will be removed one by
  // one as the card gains negative information. For each pip also create the one with positive
  // information.

  const suitPipsMap = new Map<number, Konva.Shape>();
  const suitPipsPositiveMap = new Map<number, Konva.Shape>();
  const suitPipsXMap = new Map<number, Konva.Shape>();
  const pipTypes = new Set<string>();
  for (let i = 0; i < variant.suits.length; i++) {
    const suit = variant.suits[i]!;
    const secondaryPip = pipTypes.has(suit.pip);
    pipTypes.add(suit.pip);

    // Set the pip at the middle of the card.
    const x = Math.floor(CARD_W * 0.5);
    const y = Math.floor(CARD_H * 0.5);
    const scale = {
      // Scale numbers are magic.
      x: 0.4,
      y: 0.4,
    };
    // Transform polar to Cartesian coordinates.
    const offsetBase = CARD_W * 0.7;
    const offsetTrig = (-i / variant.suits.length + 0.25) * Math.PI * 2;
    const offset = {
      x: Math.floor(offsetBase * Math.cos(offsetTrig)),
      y: Math.floor(offsetBase * Math.sin(offsetTrig)),
    };
    let { fill } = suit;
    if (suit.fill === "multi") {
      fill = "";
    }

    const suitPip = getNewColorPip(
      x,
      y,
      scale,
      offset,
      fill,
      suit,
      secondaryPip,
      false,
    );
    const suitPipPositive = getNewColorPip(
      x,
      y,
      scale,
      offset,
      fill,
      suit,
      secondaryPip,
      true,
    );
    suitPipsMap.set(i, suitPip);
    suitPipsPositiveMap.set(i, suitPipPositive);

    // Also create the X that will show when a certain suit can be ruled out.
    const suitPipX = new Konva.Shape({
      x,
      y,
      scale,
      offset,
      fill: "black",
      stroke: "white",
      strokeWidth: 6,
      opacity: 1,
      visible: false,
      sceneFunc: (ctx, shape) => {
        const width = 50;
        const xx = Math.floor(CARD_W * 0.25 - width * 0.5);
        const xy = Math.floor(CARD_H * 0.25 - width * 0.05);
        ctx.translate(-1.4 * width, -2 * width);
        drawX(ctx, shape, xx, xy, 50, width);
      },
      listening: false,
    });
    suitPipsXMap.set(i, suitPipX);
  }

  // Initialize the rank pips (along the bottom of the card).
  const rankPipsMap = new Map<number, RankPip>();
  const rankPipsXMap = new Map<number, Konva.Shape>();
  for (const rank of variant.ranks) {
    const x =
      variant.ranks.length === 5
        ? Math.floor(CARD_W * (rank * 0.19 - 0.14))
        : Math.floor(
            CARD_W * ((rank === START_CARD_RANK ? 0 : rank) * 0.15 + 0.05),
          );
    const y = 0;
    const rankPip = new RankPip({
      x,
      y,
      fontFamily: "Arial",
      fontStyle: "bold",
      fontSize: 63,
      align: "center",
      text: rank === START_CARD_RANK ? "s" : rank.toString(),
      width: Math.floor(CARD_H * 0.1),
      height: Math.floor(CARD_H * 0.1),
      fill: "white",
      stroke: "black",
      strokeWidth: 3,
      shadowEnabled: !globals.options.speedrun,
      shadowColor: "black",
      shadowOffsetX: 5,
      shadowOffsetY: 5,
      shadowOpacity: 0.4,
      shadowForStrokeEnabled: true,
      listening: false,
    });
    rankPipsMap.set(rank, rankPip);

    // Also create the X that will show when a certain rank can be ruled out.
    const rankPipX = new Konva.Shape({
      x,
      y: Math.floor(CARD_H * 0.02),
      fill: "black",
      stroke: "black",
      strokeWidth: 2,
      opacity: 1,
      visible: false,
      sceneFunc: (ctx, shape) => {
        const width = 13;
        const xx = Math.floor(CARD_W * 0.05);
        const xy = Math.floor(CARD_H * 0.047);
        drawX(ctx, shape, xx, xy, 13, width);
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
    y: Math.floor(CARD_H * 0.81),
    width: CARD_W,
    height: Math.floor(CARD_H * 0.15),
    visible: false,
    listening: false,
  });

  const rankPipsMap = new Map<number, RankPip>();
  const rankPipsXMap = new Map<number, Konva.Shape>();

  for (let i = 0; i < variant.suits.length; i++) {
    const suitPip = cachedPips.suitPipsMap.get(i)!.clone() as Konva.Shape;
    const suitPipPositive = cachedPips.suitPipsPositiveMap
      .get(i)!
      .clone() as Konva.Shape;
    const suitPipX = cachedPips.suitPipsXMap.get(i)!.clone() as Konva.Shape;
    suitPips.add(suitPip);
    suitPips.add(suitPipPositive);
    suitPips.add(suitPipX);
    suitPipsMap.set(i, suitPip);
    suitPipsPositiveMap.set(i, suitPipPositive);
    suitPipsXMap.set(i, suitPipX);
  }

  for (const rank of variant.ranks) {
    const rankPip = cachedPips.rankPipsMap.get(rank)!.clone() as RankPip;
    const rankPipX = cachedPips.rankPipsXMap.get(rank)!.clone() as Konva.Shape;
    rankPips.add(rankPip);
    rankPips.add(rankPipX);
    rankPipsMap.set(rank, rankPip);
    rankPipsXMap.set(rank, rankPipX);
    continue;
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

export function note(
  offsetCornerElements: boolean,
  shouldShowIndicator: () => boolean,
): NoteIndicator {
  // Define the note indicator image.
  const noteX = 0.78;
  const noteY = 0.03;
  const noteIndicator = new NoteIndicator({
    // If the cards have triangles on the corners that show the color composition, the images will
    // overlap. Thus, we move it downwards if this is the case.
    x: (offsetCornerElements ? noteX - 0.05 : noteX) * CARD_W,
    y: (offsetCornerElements ? noteY + 0.05 : noteY) * CARD_H,
    align: "center",
    image: globals.imageLoader!.get("note")!,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    rotation: 180,
    shadowEnabled: !globals.options.speedrun,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
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
    // If the cards have triangles on the corners that show the color composition, the images will
    // overlap. Thus, we move it upwards if this is the case.
    x: BOTTOM_LEFT_X + (offsetCornerElements ? 0.05 : 0) * CARD_W,
    y: BOTTOM_LEFT_Y - (offsetCornerElements ? 0.05 : 0) * CARD_H,
    align: "center",
    image: globals.imageLoader!.get("critical")!,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    rotation: 180,
    shadowEnabled: !globals.options.speedrun,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    visible: false,
    listening: false,
  });
  indicator.scale({
    x: -1,
    y: -1,
  });
  return indicator;
}

export const questionMark = (): Konva.Image =>
  new Konva.Image({
    x: 0.15 * CARD_W,
    y: 0.2 * CARD_H,
    width: 0.8 * CARD_W,
    height: 0.8 * CARD_W,
    image: globals.imageLoader!.get("question-mark2")!,
    visible: false,
  });

export const exclamationMark = (): Konva.Image =>
  new Konva.Image({
    x: 0.15 * CARD_W,
    y: 0.2 * CARD_H,
    width: 0.8 * CARD_W,
    height: 0.8 * CARD_W,
    image: globals.imageLoader!.get("exclamation-mark")!,
    visible: false,
  });

export const trashcan = (): Konva.Image =>
  new Konva.Image({
    x: 0.15 * CARD_W,
    y: 0.2 * CARD_H,
    width: 0.7 * CARD_W,
    height: 0.6 * CARD_H,
    image: globals.imageLoader!.get("trashcan2")!,
    visible: false,
  });

export const wrench = (): Konva.Image =>
  new Konva.Image({
    x: 0.1 * CARD_W,
    y: 0.33 * CARD_H,
    width: 0.8 * CARD_W,
    image: globals.imageLoader!.get("wrench")!,
    visible: false,
    listening: false,
  });

export const ddaIndicatorTop = (): Konva.Image =>
  new Konva.Image({
    x: TOP_LEFT_X,
    y: TOP_LEFT_Y,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    image: globals.imageLoader!.get("dda")!,
    visible: false,
    listening: false,
  });

export function ddaIndicatorBottom(offsetCornerElements: boolean): Konva.Image {
  const indicator = new Konva.Image({
    // If the cards have triangles on the corners that show the color composition, the images will
    // overlap. Thus, we move it upwards if this is the case.
    x: BOTTOM_LEFT_X + (offsetCornerElements ? 0.05 : 0) * CARD_W,
    y: BOTTOM_LEFT_Y - (offsetCornerElements ? 0.05 : 0) * CARD_H,
    align: "center",
    image: globals.imageLoader!.get("dda")!,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    visible: false,
    listening: false,
  });
  return indicator;
}

export const trashMiniIndicatorTop = (): Konva.Image =>
  new Konva.Image({
    x: TOP_LEFT_X,
    y: TOP_LEFT_Y,
    width: SMALL_ICON_SIZE,
    height: SMALL_ICON_SIZE,
    image: globals.imageLoader!.get("wastebasket")!,
    visible: false,
    listening: false,
  });

export function trashMiniIndicatorBottom(
  offsetCornerElements: boolean,
): Konva.Image {
  const indicator = new Konva.Image({
    // If the cards have triangles on the corners that show the color composition, the images will
    // overlap. Thus, we move it upwards if this is the case.
    x: BOTTOM_LEFT_X + (offsetCornerElements ? 0.05 : 0) * CARD_W,
    y: BOTTOM_LEFT_Y - (offsetCornerElements ? 0.05 : 0) * CARD_H,
    align: "center",
    image: globals.imageLoader!.get("wastebasket")!,
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
  if (src === undefined) {
    throw new Error(`The image "${name}" was not generated.`);
  }

  const dw = Math.sqrt(tf.m[0]! * tf.m[0]! + tf.m[1]! * tf.m[1]!) * width;
  const dh = Math.sqrt(tf.m[2]! * tf.m[2]! + tf.m[3]! * tf.m[3]!) * height;

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
  fill: string,
  suit: Suit,
  secondaryPip: boolean,
  isPositive: boolean,
): Konva.Shape {
  const suitPip = new Konva.Shape({
    x,
    y,
    scale,
    offset,
    fill,
    stroke: "black",
    strokeWidth: 5,
    shadowEnabled: !globals.options.speedrun,
    shadowColor: "black",
    shadowOffsetX: 15,
    shadowOffsetY: 15,
    shadowOpacity: 0.4,
    shadowForStrokeEnabled: true,
    sceneFunc: (ctx: KonvaContext.Context) => {
      drawPip(
        ctx as unknown as CanvasRenderingContext2D,
        suit,
        secondaryPip,
        false,
        undefined,
        undefined,
        isPositive,
      );
    },
    listening: false,
  });

  // Gradient numbers are magic.
  if (suit.fill === "multi") {
    suitPip.fillRadialGradientColorStops([
      0.3,
      suit.fillColors[0]!,
      0.425,
      suit.fillColors[1]!,
      0.65,
      suit.fillColors[2]!,
      0.875,
      suit.fillColors[3]!,
      1,
      suit.fillColors[4]!,
    ]);
    suitPip.fillRadialGradientStartPoint({
      x: 75,
      y: 140,
    });
    suitPip.fillRadialGradientEndPoint({
      x: 75,
      y: 140,
    });
    suitPip.fillRadialGradientStartRadius(0);
    suitPip.fillRadialGradientEndRadius(Math.floor(CARD_W * 0.25));
  }

  return suitPip;
}
