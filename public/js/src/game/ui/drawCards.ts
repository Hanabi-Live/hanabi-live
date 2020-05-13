// The Hanabi card grahpics are various HTML5 canvas drawings

// Imports
import Color from '../../Color';
import {
  CARD_H,
  CARD_W,
  STACK_BASE_RANK,
  START_CARD_RANK,
  SUITS,
  UNKNOWN_CARD_RANK,
} from '../../constants';
import Suit from '../../Suit';
import Variant from '../../Variant';
import drawPip from './drawPip';
import drawStylizedRank from './drawStylizedRank';

// This function returns an object containing all of the drawn cards images (on individual canvases)
export default (variant: Variant, colorblindMode: boolean, styleNumbers: boolean) => {
  const cardImages: Map<string, HTMLCanvasElement> = new Map();

  // Add the "Unknown" suit to the list of suits for this variant
  // The unknown suit has blank white cards, representing cards of known rank but unknown suit
  const unknownSuit = SUITS.get('Unknown');
  if (typeof unknownSuit === 'undefined') {
    throw new Error('Failed to get the "Unknown" variant in the "drawCards()" function.');
  }
  const suits = variant.suits.concat(unknownSuit);

  for (const suit of suits) {
    // Rank 0 is the stack base
    // Rank 1-5 are the normal cards
    // Rank 6 is a card of unknown rank
    // Rank 7 is a "START" card (in the "Up or Down" variants)
    for (let rank = 0; rank <= 7; rank++) {
      // We only need unknown cards for 1 through 5
      if (suit.name === 'Unknown' && (rank === 0 || rank >= 6)) {
        continue;
      }

      const cvs = initCanvas();
      const ctx = cvs.getContext('2d');
      if (ctx === null) {
        throw new Error('Failed to get the context for a new canvas element.');
      }

      // We don't need the cross texture pattern on the stack base
      if (rank !== STACK_BASE_RANK) {
        drawCardTexture(ctx);
      }

      // Make the special corners on the cards for dual-color suits
      if (suit.clueColors.length === 2) {
        drawMixedCardHelper(ctx, suit.clueColors);
      }

      // Draw the background and the borders around the card
      drawCardBase(ctx, suit, rank, colorblindMode);

      // Make a copy of the card before we write the rank
      const cvs2 = cloneCanvas(cvs);
      const ctx2 = cvs2.getContext('2d');
      if (ctx2 === null) {
        throw new Error('Failed to get the context for a new canvas element.');
      }

      for (const context of [ctx, ctx2]) {
        context.shadowBlur = 10;
        context.fillStyle = getSuitStyle(suit, ctx, 'number', colorblindMode);
        context.strokeStyle = 'black';
        context.lineWidth = 2;
        context.lineJoin = 'round';
      }

      if (rank !== STACK_BASE_RANK && rank !== UNKNOWN_CARD_RANK) {
        drawRank(ctx, rank, suit, colorblindMode, styleNumbers, false);
        drawRank(ctx2, rank, suit, colorblindMode, styleNumbers, true);
      }

      // The "Unknown" suit does not have pips
      // (it is a white suit that is used for cards that are clued with rank)
      // The "unknown rank" card of a suit does not have pips
      // (the pip is shown through a separate object that is not "baked" into the card image)
      if (suit.name !== 'Unknown' && rank !== UNKNOWN_CARD_RANK) {
        drawSuitPip(ctx, rank, suit, colorblindMode, false);
        drawSuitPip(ctx2, rank, suit, colorblindMode, true);
      }

      const cardImagesIndex = `card-${suit.name}-${rank}`;
      cardImages.set(cardImagesIndex, cvs);

      if (rank !== STACK_BASE_RANK && rank !== UNKNOWN_CARD_RANK) {
        const cardImagesIndex2 = `revealed-${suit.name}-${rank}`;
        cardImages.set(cardImagesIndex2, cvs2);
      }
    }
  }

  // Unknown 6 is a card that is completely unknown
  // This is a special case; we want to render completely unknown cards as a blank gray card
  // (instead of a blank white card)
  cardImages.set('card-Unknown-6', makeUnknownCard());

  // Additionally, create an image for the deck back
  // This is similar to the Unknown 6 card, except it has pips for each suit
  cardImages.set('deck', makeDeckBack(variant));

  return cardImages;
};

const initCanvas = () => {
  const cvs = document.createElement('canvas');
  cvs.width = CARD_W;
  cvs.height = CARD_H;
  return cvs;
};

const cloneCanvas = (oldCvs: HTMLCanvasElement) => {
  const newCvs = document.createElement('canvas');
  newCvs.width = oldCvs.width;
  newCvs.height = oldCvs.height;

  const ctx = newCvs.getContext('2d');
  if (ctx === null) {
    throw new Error('Failed to get the context for a new canvas element.');
  }
  ctx.drawImage(oldCvs, 0, 0);

  return newCvs;
};

const drawRank = (
  ctx: CanvasRenderingContext2D,
  rank: number,
  suit: Suit,
  colorblindMode: boolean,
  styleNumbers: boolean,
  centered: boolean,
) => {
  let textYPos;
  let rankLabel = rank.toString();
  if (rank === START_CARD_RANK) {
    rankLabel = 'S';
  }
  let fontSize;
  if (colorblindMode) {
    rankLabel += suit.abbreviation;
    fontSize = 68;
    textYPos = 83;
  } else {
    fontSize = 96;
    textYPos = 110;
  }
  if (centered) {
    fontSize *= 1.5;
    textYPos *= 2.45;
  }

  ctx.font = `bold ${fontSize}pt Arial`;

  // Draw the rank on the top left
  ctx.save();
  if (styleNumbers && !colorblindMode) {
    drawStylizedRank(ctx, rank);
    ctx.restore();
    ctx.fill();
    ctx.stroke();
  } else {
    drawText(ctx, textYPos, rankLabel);
  }
  ctx.restore();
};

const drawSuitPip = (
  ctx: CanvasRenderingContext2D,
  rank: number,
  suit: Suit,
  colorblindMode: boolean,
  centered: boolean,
) => {
  const scale = 0.4;

  ctx.save();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  if (rank === 0) {
    // For stack bases, draw a big pip in the center
    ctx.globalAlpha = 1;
    ctx.scale(scale * 2.5, scale * 2.5);
  } else {
    // Draw the pip next to the rank in the top-left hand corner
    ctx.globalAlpha = 1;
    let symbolYPos;
    if (centered) {
      symbolYPos = 0;
    } else if (colorblindMode) {
      symbolYPos = 80;
    } else {
      symbolYPos = 138;
    }
    if (centered) {
      ctx.translate(50, -symbolYPos);
      ctx.scale(scale * 2.75, scale * 2.75);
    } else {
      ctx.translate(0, -symbolYPos);
      ctx.scale(scale * 1.8, scale * 1.8);
    }
  }
  drawPip(ctx, suit, true);
  ctx.restore();
};

const makeUnknownCard = () => {
  const cvs = initCanvas();
  const ctx = cvs.getContext('2d');
  if (ctx === null) {
    throw new Error('Failed to get the context for a new canvas element.');
  }

  drawCardTexture(ctx);
  ctx.fillStyle = 'black';
  cardBorderPath(ctx, 4);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#444444';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';

  ctx.translate(CARD_W / 2, CARD_H / 2);

  return cvs;
};

const makeDeckBack = (variant: Variant) => {
  const cvs = makeUnknownCard();
  const ctx = cvs.getContext('2d');
  if (ctx === null) {
    throw new Error('Failed to get the context for a new canvas element.');
  }

  const sf = 0.4; // Scale factor
  const nSuits = variant.suits.length;
  ctx.scale(sf, sf);
  for (let i = 0; i < variant.suits.length; i++) {
    const suit = variant.suits[i];

    // Transform polar to cartesian coordinates
    const x = -1.05 * Math.floor(CARD_W * 0.7 * Math.cos(((-i / nSuits) + 0.25) * Math.PI * 2));
    const y = -1.05 * Math.floor(CARD_W * 0.7 * Math.sin(((-i / nSuits) + 0.25) * Math.PI * 2));

    ctx.save();
    ctx.translate(x, y);
    drawPip(ctx, suit, true, false, '#444444'); // Pips on the back of the deck should be gray
    ctx.restore();
  }
  ctx.scale(1 / sf, 1 / sf);

  return cvs;
};

const drawCardBase = (
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  rank: number,
  colorblindMode: boolean,
) => {
  // Draw the background
  ctx.fillStyle = getSuitStyle(suit, ctx, 'background', colorblindMode);
  ctx.strokeStyle = getSuitStyle(suit, ctx, 'background', colorblindMode);
  cardBorderPath(ctx, 4);

  // Draw the borders (on visible cards) and the color fill
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 8;
  // The borders should be more opaque for the stack base
  if (rank === 0) {
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
  ctx.restore();
};

const cardBorderPath = (ctx: CanvasRenderingContext2D, padding: number) => {
  const xrad = CARD_W * 0.08;
  const yrad = CARD_W * 0.08;
  // (we want them to both have the same value so that the curve has a 45 degree angle)
  ctx.beginPath();
  ctx.moveTo(padding, yrad + padding); // Top-left corner
  ctx.lineTo(padding, CARD_H - yrad - padding); // Bottom-left corner
  ctx.quadraticCurveTo(0, CARD_H, xrad + padding, CARD_H - padding);
  ctx.lineTo(CARD_W - xrad - padding, CARD_H - padding); // Bottom-right corner
  ctx.quadraticCurveTo(CARD_W, CARD_H, CARD_W - padding, CARD_H - yrad - padding);
  ctx.lineTo(CARD_W - padding, yrad + padding); // Top-right corner
  ctx.quadraticCurveTo(CARD_W, 0, CARD_W - xrad - padding, padding);
  ctx.lineTo(xrad + padding, padding); // Top-left corner
  ctx.quadraticCurveTo(0, 0, padding, yrad + padding);
};

const drawShape = (ctx: CanvasRenderingContext2D) => {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.fill();
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.stroke();
};

const drawText = (ctx: CanvasRenderingContext2D, textYPos: number, indexLabel: string) => {
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.fillText(indexLabel, 19, textYPos);
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.strokeText(indexLabel, 19, textYPos);
};

const drawMixedCardHelper = (ctx: CanvasRenderingContext2D, clueColors: Color[]) => {
  const [clueColor1, clueColor2] = clueColors;

  ctx.save();
  ctx.lineWidth = 1;
  const triangleSize = 50;
  const borderSize = 8;

  // Draw the first half of the top-right triangle
  ctx.beginPath();
  ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
  ctx.lineTo(CARD_W - borderSize - triangleSize, borderSize); // Move left
  // Move down and right diagonally
  ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
  ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor1.fill;
  drawShape(ctx);

  // Draw the second half of the top-right triangle
  ctx.beginPath();
  ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
  ctx.lineTo(CARD_W - borderSize, borderSize + triangleSize); // Move down
  // Move up and left diagonally
  ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
  ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
  ctx.fillStyle = clueColor2.fill;
  drawShape(ctx);

  ctx.restore();
};

// Draw texture lines on card
const drawCardTexture = (ctx: CanvasRenderingContext2D) => {
  cardBorderPath(ctx, 4);

  ctx.fillStyle = 'white';
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = 'black';

  for (let x = 0; x < CARD_W; x += 4 + (Math.random() * 4)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CARD_H);
    ctx.stroke();
  }

  for (let y = 0; y < CARD_H; y += 4 + (Math.random() * 4)) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_W, y);
    ctx.stroke();
  }

  ctx.restore();
};

const getSuitStyle = (
  suit: Suit,
  ctx: CanvasRenderingContext2D,
  cardArea: string,
  colorblindMode: boolean,
) => {
  // Nearly all suits have a solid fill
  if (suit.fill !== 'multi') {
    return colorblindMode ? suit.fillColorblind : suit.fill;
  }

  // Rainbow suits use a gradient fill, but the specific type of gradient will depend on the
  // specific element of the card that we are filling in
  if (cardArea === 'number') {
    return evenLinearGradient(ctx, suit.fillColors, [0, 14, 0, 110]);
  }
  if (cardArea === 'background') {
    if (suit.name === 'Omni' || suit.name === 'Dark Omni') {
      return evenLinearGradient(ctx, suit.fillColors, [0, -30, 0, CARD_H + 30]);
    }
    return evenLinearGradient(ctx, suit.fillColors, [0, 0, CARD_W, CARD_H]);
  }
  throw new Error(`The card area of "${cardArea}" is unknown in the "getSuitStyle()" function.`);
};

// Generates a vertical gradient that is evenly distributed between its component colors
const evenLinearGradient = (
  ctx: CanvasRenderingContext2D,
  colors: string[],
  args: number[],
) => {
  const grad = ctx.createLinearGradient(args[0], args[1], args[2], args[3]);
  for (let i = 0; i < colors.length; ++i) {
    grad.addColorStop(i / (colors.length - 1), colors[i]);
  }
  return grad;
};
