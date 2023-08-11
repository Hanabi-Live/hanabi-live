// The card graphics are various HTML5 canvas drawings.

import type { Color, Suit, Variant } from "@hanabi/data";
import {
  STACK_BASE_RANK,
  START_CARD_RANK,
  UNKNOWN_CARD_RANK,
  getSuit,
} from "@hanabi/data";
import * as abbreviationRules from "../rules/abbreviation";
import { CARD_H, CARD_W } from "./constants";
import { drawPip } from "./drawPip";
import { drawStylizedRank } from "./drawStylizedRank";

// This function returns an object containing all of the drawn cards images (on individual
// canvases).
export function drawCards(
  variant: Variant,
  colorblindMode: boolean,
  styleNumbers: boolean,
  enableShadows: boolean,
  initCanvas: () => [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D],
  cloneCanvas: (
    oldCvs: HTMLCanvasElement,
    oldCtx: CanvasRenderingContext2D,
  ) => HTMLCanvasElement,
  saveCanvas: (
    cvs: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) => HTMLCanvasElement,
): Map<string, HTMLCanvasElement> {
  const cardImages = new Map<string, HTMLCanvasElement>();

  // Add the "Unknown" suit to the list of suits for this variant. The unknown suit has blank white
  // cards, representing cards of known rank but unknown suit.
  const unknownSuit = getSuit("Unknown");
  const suits = variant.suits.concat(unknownSuit);
  const pipTypes = new Set<string>();

  let suitIndex = -1;
  for (const suit of suits) {
    suitIndex++;
    const secondaryPip = pipTypes.has(suit.pip);
    pipTypes.add(suit.pip);

    // - Rank 0 is the stack base.
    // - Rank 1-5 are the normal cards.
    // - Rank 6 is a card of unknown rank.
    // - Rank 7 is a "START" card (in the "Up or Down" variants).
    for (let rank = 0; rank <= 7; rank++) {
      // We need unknown cards for 1, 2, 3, 4, 5, and the "START" card.
      if (
        suit.name === "Unknown" &&
        (rank === STACK_BASE_RANK || rank === UNKNOWN_CARD_RANK)
      ) {
        continue;
      }

      const [cvs, ctx] = initCanvas();

      // We don't need the background on the stack base.
      if (rank !== STACK_BASE_RANK) {
        drawCardBackground(ctx, enableShadows);
      }

      // Make the special corners on the cards for dual-color suits. Don't do this for Matryoshka
      // suits which have names ending in MD.
      if (suit.clueColors.length === 2 && !suit.name.endsWith("MD")) {
        drawMixedCardHelper(ctx, suit.clueColors, enableShadows);
      }

      // Draw the background and the borders around the card.
      drawCardBase(ctx, suit, rank, variant, colorblindMode, enableShadows);

      ctx.shadowBlur = 10;
      ctx.fillStyle = getSuitStyle(
        suit,
        rank,
        ctx,
        "number",
        variant,
        colorblindMode,
      );
      ctx.strokeStyle = "black";
      ctx.lineWidth = enableShadows ? 2 : 8;
      ctx.lineJoin = "round";

      if (rank !== STACK_BASE_RANK && rank !== UNKNOWN_CARD_RANK) {
        let textYPos: number;
        let rankLabel = rank.toString();
        if (rank === START_CARD_RANK) {
          rankLabel = "S";
        }
        let fontSize: number;
        if (colorblindMode) {
          rankLabel += abbreviationRules.get(suit.name, variant);
          fontSize = 68;
          textYPos = 83;
        } else {
          fontSize = 96;
          textYPos = 110;
        }

        ctx.font = `bold ${fontSize}pt Arial`;

        // Draw the rank on the top left.
        ctx.save();
        if (styleNumbers && !colorblindMode) {
          drawStylizedRank(ctx, rank);
          ctx.fill();
          ctx.stroke();
        } else {
          drawText(ctx, textYPos, rankLabel, enableShadows);
        }
        if (
          variant.specialDeceptive &&
          rank === variant.specialRank &&
          suit.name !== "Unknown" &&
          !suit.noClueRanks
        ) {
          const deceptiveRank =
            variant.clueRanks[suitIndex % variant.clueRanks.length]!;
          if (colorblindMode) {
            ctx.translate(CARD_W / 20, CARD_H / 5);
            ctx.scale(0.65, 0.65);
          } else {
            ctx.translate(CARD_W / 4 + CARD_W / 50, CARD_H / 40);
            ctx.scale(0.5, 0.5);
          }
          if (styleNumbers && !colorblindMode) {
            drawStylizedRank(ctx, deceptiveRank);
            ctx.fill();
            ctx.stroke();
          } else {
            drawText(ctx, textYPos, `${deceptiveRank}`, enableShadows);
          }
        }
        ctx.restore();

        // "Index" cards are used to draw cards of learned but not yet known rank
        // (e.g. for in-game replays)
        const cardImagesIndex = `Index-${suit.name}-${rank}`;
        cardImages.set(cardImagesIndex, cloneCanvas(cvs, ctx));

        // Draw the rank on the bottom right.
        if (!variant.upOrDown && !suit.reversed) {
          ctx.save();
          ctx.translate(CARD_W, CARD_H);
          ctx.rotate(Math.PI);
          if (styleNumbers && !colorblindMode) {
            drawStylizedRank(ctx, rank);
            ctx.fill();
            ctx.stroke();
          } else {
            drawText(ctx, textYPos, rankLabel, enableShadows);
          }
          ctx.restore();
        }
      }

      // The "Unknown" suit does not have pips. (It is a white suit that is used for cards that are
      // clued with rank.)
      if (suit.name !== "Unknown") {
        drawSuitPips(
          ctx,
          rank,
          suit,
          secondaryPip,
          colorblindMode,
          enableShadows,
        );
      }

      const cardImagesIndex = `card-${suit.name}-${rank}`;
      const cardImage = saveCanvas(cvs, ctx);
      cardImages.set(cardImagesIndex, cardImage);
    }
  }

  // Unknown 6 is a card that is completely unknown. This is a special case; we want to render
  // completely unknown cards as a blank gray card (instead of a blank white card).
  {
    const [cvs, ctx] = makeUnknownCard(initCanvas, enableShadows);
    const cardUnknown = saveCanvas(cvs, ctx);
    cardImages.set(`card-Unknown-${UNKNOWN_CARD_RANK}`, cardUnknown);
  }

  // Additionally, create an image for the deck back. This is similar to the Unknown 6 card, except
  // it has pips for each suit.
  {
    const [cvs, ctx] = makeDeckBack(variant, initCanvas, enableShadows);
    const deckBack = saveCanvas(cvs, ctx);
    cardImages.set("deck-back", deckBack);
  }

  return cardImages;
}

function drawSuitPips(
  ctx: CanvasRenderingContext2D,
  rank: number,
  suit: Suit,
  secondaryPip: boolean,
  colorblindMode: boolean,
  enableShadows: boolean,
) {
  const scale = 0.4;

  // The middle for card 1.
  if (rank === 1) {
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.scale(scale * 1.8, scale * 1.8);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Top and bottom for card 2.
  if (rank === 2) {
    const symbolYPos = colorblindMode ? 60 : 90;
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(0, -symbolYPos);
    ctx.scale(scale * 1.4, scale * 1.4);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();

    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(0, symbolYPos);
    ctx.scale(scale * 1.4, scale * 1.4);
    ctx.rotate(Math.PI);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Top and bottom for cards 3, 4, 5.
  if (rank >= 3 && rank <= 5) {
    const symbolYPos = colorblindMode ? 80 : 120;
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(0, -symbolYPos);
    ctx.scale(scale, scale);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();

    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(0, symbolYPos);
    ctx.scale(scale, scale);
    ctx.rotate(Math.PI);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Left and right for cards 4 and 5.
  if (rank === 4 || rank === 5) {
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(-90, 0);
    ctx.scale(scale, scale);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();

    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.translate(90, 0);
    ctx.scale(scale, scale);
    ctx.rotate(Math.PI);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Size, position, and alpha adjustment for the central icon on 3 and 5.
  if (rank === 3 || rank === 5) {
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.scale(scale * 1.2, scale * 1.2);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Size, position, and alpha adjustment for the central icon on stack base.
  if (rank === STACK_BASE_RANK) {
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.scale(scale * 2.5, scale * 2.5);
    drawPip(ctx, suit, secondaryPip, enableShadows);
    ctx.restore();
  }

  // Draw large suit pip.
  if (rank === UNKNOWN_CARD_RANK || rank === START_CARD_RANK) {
    ctx.save();
    let lineWidth: number | undefined;
    if (rank === START_CARD_RANK) {
      lineWidth = 2;
    } else {
      // Make the pip faint.
      ctx.globalAlpha = colorblindMode ? 0.4 : 0.1;
    }
    ctx.translate(CARD_W / 2, CARD_H / 2);
    ctx.scale(scale * 3, scale * 3);
    drawPip(ctx, suit, secondaryPip, enableShadows, undefined, lineWidth);
    ctx.restore();
  }
}

function makeUnknownCard(
  initCanvas: () => [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D],
  enableShadows: boolean,
) {
  const [cvs, ctx] = initCanvas();

  drawCardBackground(ctx, enableShadows);
  ctx.fillStyle = "black";
  cardBorderPath(ctx, 4, enableShadows);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#444444";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";

  ctx.translate(CARD_W / 2, CARD_H / 2);

  const namedTuple: [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D] = [
    cvs,
    ctx,
  ];
  return namedTuple;
}

function makeDeckBack(
  variant: Variant,
  initCanvas: () => [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D],
  enableShadows: boolean,
) {
  const [cvs, ctx] = makeUnknownCard(initCanvas, enableShadows);
  const pipTypes = new Set<string>();

  const sf = 0.4; // Scale factor
  const nSuits = variant.suits.length;
  ctx.scale(sf, sf);
  for (let i = 0; i < variant.suits.length; i++) {
    const suit = variant.suits[i]!;
    const secondaryPip = pipTypes.has(suit.pip);
    pipTypes.add(suit.pip);

    // Transform polar to cartesian coordinates.
    const x =
      -1.05 *
      Math.floor(CARD_W * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2));
    const y =
      -1.05 *
      Math.floor(CARD_W * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2));

    ctx.save();
    ctx.translate(x, y);
    drawPip(ctx, suit, secondaryPip, true, "#444444"); // Pips on the back of the deck should be gray
    ctx.restore();
  }
  ctx.scale(1 / sf, 1 / sf);

  const namedTuple: [cvs: HTMLCanvasElement, ctx: CanvasRenderingContext2D] = [
    cvs,
    ctx,
  ];
  return namedTuple;
}

function drawCardBase(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  rank: number,
  variant: Variant,
  colorblindMode: boolean,
  enableShadows: boolean,
) {
  // Draw the background.
  ctx.save();
  ctx.fillStyle = getSuitStyle(
    suit,
    rank,
    ctx,
    "background",
    variant,
    colorblindMode,
  );
  ctx.strokeStyle = getSuitStyle(
    suit,
    rank,
    ctx,
    "background",
    variant,
    colorblindMode,
  );
  cardBorderPath(ctx, 4, enableShadows);

  // Draw the borders (on visible cards) and the color fill.
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 8;
  // The borders should be more opaque for the stack base.
  if (rank === 0) {
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
  ctx.restore();
}

function cardBorderPath(
  ctx: CanvasRenderingContext2D,
  padding: number,
  enableShadows: boolean,
) {
  const roundedCornerSeverity = enableShadows ? 0.08 : 0.12;
  const xRadians = CARD_W * roundedCornerSeverity;
  const yRadians = CARD_W * roundedCornerSeverity;
  // (We want them to both have the same value so that the curve has a 45 degree angle.)
  ctx.beginPath();
  ctx.moveTo(padding, yRadians + padding); // Top-left corner
  ctx.lineTo(padding, CARD_H - yRadians - padding); // Bottom-left corner
  ctx.quadraticCurveTo(0, CARD_H, xRadians + padding, CARD_H - padding);
  ctx.lineTo(CARD_W - xRadians - padding, CARD_H - padding); // Bottom-right corner
  ctx.quadraticCurveTo(
    CARD_W,
    CARD_H,
    CARD_W - padding,
    CARD_H - yRadians - padding,
  );
  ctx.lineTo(CARD_W - padding, yRadians + padding); // Top-right corner
  ctx.quadraticCurveTo(CARD_W, 0, CARD_W - xRadians - padding, padding);
  ctx.lineTo(xRadians + padding, padding); // Top-left corner
  ctx.quadraticCurveTo(0, 0, padding, yRadians + padding);
}

function drawShape(ctx: CanvasRenderingContext2D, enableShadows: boolean) {
  if (enableShadows) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  }
  ctx.fill();
  if (enableShadows) {
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
  }
  ctx.stroke();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  textYPos: number,
  indexLabel: string,
  enableShadows: boolean,
) {
  ctx.save();
  if (enableShadows) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.fillText(indexLabel, 19, textYPos);
    ctx.shadowColor = "rgba(0, 0, 0, 0)";
    ctx.strokeText(indexLabel, 19, textYPos);
  } else {
    ctx.strokeText(indexLabel, 19, textYPos);
    ctx.fillText(indexLabel, 19, textYPos);
  }
  ctx.restore();
}

function drawMixedCardHelper(
  ctx: CanvasRenderingContext2D,
  clueColors: readonly Color[],
  enableShadows: boolean,
) {
  const [clueColor1, clueColor2] = clueColors;

  ctx.save();
  ctx.lineWidth = 1;
  const triangleSize = 50;
  const borderSize = 8;

  // Draw the first half of the top-right triangle.
  ctx.beginPath();
  ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
  ctx.lineTo(CARD_W - borderSize - triangleSize, borderSize); // Move left
  // Move down and right diagonally.
  ctx.lineTo(
    CARD_W - borderSize - triangleSize / 2,
    borderSize + triangleSize / 2,
  );
  ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor1!.fill;
  drawShape(ctx, enableShadows);

  // Draw the second half of the top-right triangle.
  ctx.beginPath();
  ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
  ctx.lineTo(CARD_W - borderSize, borderSize + triangleSize); // Move down
  // Move up and left diagonally.
  ctx.lineTo(
    CARD_W - borderSize - triangleSize / 2,
    borderSize + triangleSize / 2,
  );
  ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor2!.fill;
  drawShape(ctx, enableShadows);

  // Draw the first half of the bottom-left triangle.
  ctx.beginPath();
  ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
  ctx.lineTo(borderSize, CARD_H - borderSize - triangleSize); // Move up
  // Move right and down diagonally.
  ctx.lineTo(
    borderSize + triangleSize / 2,
    CARD_H - borderSize - triangleSize / 2,
  );
  ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor1!.fill;
  drawShape(ctx, enableShadows);

  // Draw the second half of the bottom-left triangle.
  ctx.beginPath();
  ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
  ctx.lineTo(borderSize + triangleSize, CARD_H - borderSize); // Move right
  // Move left and up diagonally.
  ctx.lineTo(
    borderSize + triangleSize / 2,
    CARD_H - borderSize - triangleSize / 2,
  );
  ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor2!.fill;
  drawShape(ctx, enableShadows);

  ctx.restore();
}

function drawCardBackground(
  ctx: CanvasRenderingContext2D,
  enableShadows: boolean,
) {
  ctx.save();
  cardBorderPath(ctx, 4, enableShadows);

  ctx.fillStyle = "white";
  ctx.fill();

  ctx.restore();
}

function getSuitStyle(
  suit: Suit,
  rank: number,
  ctx: CanvasRenderingContext2D,
  cardArea: string,
  variant: Variant,
  colorblindMode: boolean,
) {
  if (cardArea === "number") {
    // In Synesthesia variants, color the number itself with the color that it contributes to the
    // card.
    if (variant.synesthesia) {
      if (rank === 0) {
        return suit.fill;
      }

      // If the suit does not get clued by its rank, then coloring the rank is misleading, so use
      // the suit color.
      if (suit.noClueRanks) {
        return suit.fill;
      }
      const prismColorIndex = (rank - 1) % variant.clueColors.length;

      return variant.clueColors[prismColorIndex]!.fill;
    }

    if (rank === variant.specialRank) {
      const allClueColors =
        suit.allClueColors ||
        (variant.specialAllClueColors && !suit.noClueColors);
      const noClueColors =
        suit.noClueColors ||
        (variant.specialNoClueColors && !suit.allClueColors);
      const allClueRanks =
        suit.allClueRanks || (variant.specialAllClueRanks && !suit.noClueRanks);
      const noClueRanks =
        suit.noClueRanks || (variant.specialNoClueRanks && !suit.allClueRanks);
      const dark = suit.oneOfEach;
      if (allClueColors) {
        if (allClueRanks) {
          const rainbow = getSuit(dark ? "Dark Omni" : "Omni");
          return evenLinearGradient(ctx, rainbow.fillColors, [0, 14, 0, 110]);
        }
        if (noClueRanks) {
          const rainbow = getSuit(dark ? "Cocoa Rainbow" : "Muddy Rainbow");
          return evenLinearGradient(ctx, rainbow.fillColors, [0, 14, 0, 110]);
        }
        const rainbow = getSuit(dark ? "Dark Rainbow" : "Rainbow");
        return evenLinearGradient(ctx, rainbow.fillColors, [0, 14, 0, 110]);
      }
      if (noClueColors) {
        if (allClueRanks) {
          return getSuit(dark ? "Gray Pink" : "Light Pink").fill;
        }
        if (noClueRanks) {
          return getSuit(dark ? "Dark Null" : "Null").fill;
        }
        return getSuit(dark ? "Gray" : "White").fill;
      }
      if (allClueRanks) {
        return getSuit(dark ? "Dark Pink" : "Pink").fill;
      }
      if (noClueRanks) {
        return getSuit(dark ? "Dark Brown" : "Brown").fill;
      }
    }
  }

  if (suit.prism) {
    // Prism cards have a custom color depending on their rank.
    if (rank === 0) {
      return suit.fill;
    }

    let prismColorIndex = (rank - 1) % variant.clueColors.length;
    if (rank === START_CARD_RANK) {
      // "START" cards count as rank 0, so they are touched by the final color.
      prismColorIndex = variant.clueColors.length - 1;
    }
    const fillToMixHex = variant.clueColors[prismColorIndex]!.fill;
    const fillToMixRGB = hexToRGB(fillToMixHex);
    if (fillToMixRGB === undefined) {
      return suit.fill;
    }
    const fillToMixArray = [fillToMixRGB.r, fillToMixRGB.g, fillToMixRGB.b];
    let fillToMixArray2 = [255, 255, 255]; // White
    if (suit.oneOfEach) {
      fillToMixArray2 = [0, 0, 0]; // Black
    }

    return colorMixer(fillToMixArray, fillToMixArray2, 0.5); // Mix it with white by 50%
  }

  // Nearly all other suits have a solid fill.
  if (suit.fill !== "multi") {
    return colorblindMode ? suit.fillColorblind : suit.fill;
  }

  // Rainbow suits use a gradient fill, but the specific type of gradient will depend on the
  // specific element of the card that we are filling in.
  if (cardArea === "number") {
    return evenLinearGradient(ctx, suit.fillColors, [0, 14, 0, 110]);
  }
  if (cardArea === "background") {
    if (suit.name === "Omni" || suit.name === "Dark Omni") {
      return evenLinearGradient(ctx, suit.fillColors, [0, -30, 0, CARD_H + 30]);
    }
    return evenLinearGradient(ctx, suit.fillColors, [0, 0, CARD_W, CARD_H]);
  }
  throw new Error(
    `The card area of "${cardArea}" is unknown in the "getSuitStyle()" function.`,
  );
}

// Generates a vertical gradient that is evenly distributed between its component colors.
function evenLinearGradient(
  ctx: CanvasRenderingContext2D,
  colors: readonly string[],
  args: readonly number[],
) {
  const grad = ctx.createLinearGradient(args[0]!, args[1]!, args[2]!, args[3]!);
  for (let i = 0; i < colors.length; i++) {
    grad.addColorStop(i / (colors.length - 1), colors[i]!);
  }

  return grad;
}

// From: https://stackoverflow.com/questions/14819058/mixing-two-colors-naturally-in-javascript
// - `colorChannelA` and `colorChannelB` are integers ranging from 0 to 255
// - `amountToMix` ranges from 0.0 to 1.0
function colorChannelMixer(
  colorChannelA: number,
  colorChannelB: number,
  amountToMix: number,
) {
  const channelA = colorChannelA * amountToMix;
  const channelB = colorChannelB * (1 - amountToMix);
  return channelA + channelB;
}

/**
 * From: https://stackoverflow.com/questions/14819058/mixing-two-colors-naturally-in-javascript
 *
 * - `rgbA` and `rgbB` are arrays.
 * - `amountToMix` ranges from 0.0 to 1.0.
 * - For example: `(red): rgbA = [255,0,0]`
 */
function colorMixer(rgbA: number[], rgbB: number[], amountToMix: number) {
  const r = colorChannelMixer(rgbA[0]!, rgbB[0]!, amountToMix);
  const g = colorChannelMixer(rgbA[1]!, rgbB[1]!, amountToMix);
  const b = colorChannelMixer(rgbA[2]!, rgbB[2]!, amountToMix);
  return `rgb(${r},${g},${b})`;
}

/** From: https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb */
function hexToRGB(
  hex: string,
): { r: number; g: number; b: number } | undefined {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result === null) {
    return undefined;
  }

  // We must use `Number.parseInt` since we have use a radix of 16.
  const r = Number.parseInt(result[1]!, 16);
  if (Number.isNaN(r)) {
    return undefined;
  }

  // We must use `Number.parseInt` since we have use a radix of 16.
  const g = Number.parseInt(result[2]!, 16);
  if (Number.isNaN(r)) {
    return undefined;
  }

  // We must use `Number.parseInt` since we have use a radix of 16.
  const b = Number.parseInt(result[3]!, 16);
  if (Number.isNaN(r)) {
    return undefined;
  }

  return {
    r,
    g,
    b,
  };
}
