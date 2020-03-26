/*
    The Hanabi card grahpics are various HTML5 canvas drawings
*/

// Imports
import {
    CARD_H,
    CARD_W,
    STACK_BASE_RANK,
    START_CARD_RANK,
    SUITS,
    UNKNOWN_CARD_RANK,
} from '../../constants';
import Color from '../../Color';
import drawPip from './drawPip';
import drawRank from './drawRank';
import globals from './globals';
import Suit from '../../Suit';
import Variant from '../../Variant';

// This function returns an object containing all of the drawn cards images (on individual canvases)
export default (variant: Variant, colorblindUI: boolean) => {
    const cardImages: Map<string, HTMLCanvasElement> = new Map();

    // Add the "unknown" suit to the list of suits for this variant
    // The unknown suit has semi-blank gray cards, representing unknown cards
    const unknownSuit = SUITS.get('Unknown');
    if (typeof unknownSuit === 'undefined') {
        throw new Error('Failed to get the "Unknown" variant in the "drawCards()" function.');
    }
    const suits = variant.suits.concat(unknownSuit);

    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Rank 0 is the stack base
        // Rank 1-5 are the normal cards
        // Rank 6 is a card of unknown rank
        // Rank 7 is a "START" card (in the "Up or Down" variants)
        for (let rank = 0; rank <= 7; rank++) {
            const cvs = initCanvas();
            const ctx = cvs.getContext('2d');
            if (ctx === null) {
                throw new Error('Failed to get the context for a new canvas element.');
            }

            // We don't need the cross texture pattern on the stack base
            if (rank !== 0) {
                drawCardTexture(ctx);
            }

            // Make the special corners on the cards for dual-color suits
            if (suit.clueColors.length === 2) {
                drawMixedCardHelper(ctx, suit.clueColors);
            }

            drawCardBase(ctx, suit, rank);

            ctx.shadowBlur = 10;
            ctx.fillStyle = getSuitStyle(suit, ctx, 'number');
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            if (rank !== STACK_BASE_RANK && rank !== UNKNOWN_CARD_RANK) {
                let textYPos;
                let rankLabel = rank.toString();
                if (rank === START_CARD_RANK) {
                    rankLabel = 'S';
                }
                let fontSize;
                if (colorblindUI) {
                    rankLabel = suit.abbreviation + rankLabel;
                    fontSize = 68;
                    textYPos = 83;
                } else {
                    fontSize = 96;
                    textYPos = 110;
                }

                ctx.font = `bold ${fontSize}pt Arial`;

                // Draw the rank on the top left
                if (colorblindUI) {
                    drawText(ctx, textYPos, rankLabel);
                } else {
                    ctx.save();
                    drawRank(ctx, rank);
                    ctx.restore();
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();

                // "Index" cards are used to draw cards of learned but not yet known rank
                // (e.g. for in-game replays)
                const cardImagesIndex = `Index-${suit.name}-${rank}`;
                cardImages.set(cardImagesIndex, cloneCanvas(cvs));

                // Draw the rank on the bottom right
                ctx.save();
                ctx.translate(CARD_W, CARD_H);
                ctx.rotate(Math.PI);
                if (colorblindUI) {
                    drawText(ctx, textYPos, rankLabel);
                } else {
                    drawRank(ctx, rank);
                    ctx.restore();
                    ctx.translate(CARD_W, CARD_H);
                    ctx.rotate(Math.PI);
                    ctx.fill();
                    ctx.stroke();
                    ctx.translate(CARD_W, CARD_H);
                    ctx.rotate(Math.PI);
                }
                ctx.restore();
            }

            // "NoPip" cards are used for
            // - cards of known rank before suit learned
            // - cards of unknown rank
            // Entirely unknown cards (e.g. "NoPip-Unknown-6")
            // have a custom image defined separately
            if (rank >= 1 && (rank <= 5 || suit.name !== 'Unknown')) {
                const cardImagesIndex = `NoPip-${suit.name}-${rank}`;
                cardImages.set(cardImagesIndex, cloneCanvas(cvs));
            }

            if (suit.name !== 'Unknown') {
                drawSuitPips(ctx, rank, suit, colorblindUI);
            }

            // "Card-Unknown" images would be identical to "NoPip-Unknown" images
            if (suit.name !== 'Unknown') {
                const cardImagesIndex = `Card-${suit.name}-${rank}`;
                cardImages.set(cardImagesIndex, cvs);
            }
        }
    }

    cardImages.set(`NoPip-Unknown-${UNKNOWN_CARD_RANK}`, makeUnknownCard());
    cardImages.set('deck-back', makeDeckBack(variant));
    cardImages.set('known-trash', makeKnownTrash());

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

const drawSuitPips = (
    ctx: CanvasRenderingContext2D,
    rank: number,
    suit: Suit,
    colorblindUI: boolean,
) => {
    const scale = 0.4;

    // The middle for card 1
    if (rank === 1) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 1.8, scale * 1.8);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Top and bottom for card 2
    if (rank === 2) {
        const symbolYPos = colorblindUI ? 60 : 90;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale * 1.4, scale * 1.4);
        drawPip(ctx, suit, true, false);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, symbolYPos);
        ctx.scale(scale * 1.4, scale * 1.4);
        ctx.rotate(Math.PI);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Top and bottom for cards 3, 4, 5
    if (rank >= 3 && rank <= 5) {
        const symbolYPos = colorblindUI ? 80 : 120;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        drawPip(ctx, suit, true, false);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, symbolYPos);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Left and right for cards 4 and 5
    if (rank === 4 || rank === 5) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        drawPip(ctx, suit, true, false);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(90, 0);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Size, position, and alpha adjustment for the central icon on 3 and 5
    if (rank === 3 || rank === 5) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 1.2, scale * 1.2);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Size, position, and alpha adjustment for the central icon on stack base
    if (rank === 0) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 2.5, scale * 2.5);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = colorblindUI ? 0.4 : 0.1;
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 3, scale * 3);
        drawPip(ctx, suit, true, false);
        ctx.restore();
    }
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
    ctx.globalAlpha = 0.7;
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
        const x = -1.05 * Math.floor(CARD_W * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2)); // eslint-disable-line
        const y = -1.05 * Math.floor(CARD_W * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2)); // eslint-disable-line

        ctx.save();
        ctx.translate(x, y);
        drawPip(ctx, suit, true, true);
        ctx.restore();
    }
    ctx.scale(1 / sf, 1 / sf);

    return cvs;
};

const makeKnownTrash = () => {
    const cvs = makeUnknownCard();
    const ctx = cvs.getContext('2d');
    if (ctx === null) {
        throw new Error('Failed to get the context for a new canvas element.');
    }

    // Draw the trash can image on top of the card
    ctx.drawImage(globals.ImageLoader!.get('trashcan2')!, -103, -120);

    return cvs;
};

const drawCardBase = (ctx: CanvasRenderingContext2D, suit: Suit, rank: number) => {
    // Draw the background
    ctx.fillStyle = getSuitStyle(suit, ctx, 'background');
    ctx.strokeStyle = getSuitStyle(suit, ctx, 'background');
    cardBorderPath(ctx, 4);

    ctx.save();
    // Draw the borders (on visible cards) and the color fill
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

const drawMixedCardHelper = (ctx: CanvasRenderingContext2D, clueColors: Array<Color>) => {
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

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, CARD_H - borderSize - triangleSize); // Move up
    // Move right and down diagonally
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.fill;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, CARD_H - borderSize); // Move right
    // Move left and up diagonally
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
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

const getSuitStyle = (suit: Suit, ctx: CanvasRenderingContext2D, cardArea: string) => {
    // Nearly all suits have a solid fill
    if (suit.fill !== 'multi') {
        return suit.fill;
    }

    // Rainbow suits use a gradient fill, but the specific type of gradient will depend on the
    // specific element of the card that we are filling in
    if (cardArea === 'number') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 14, 0, 110]);
    }
    if (cardArea === 'background') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 0, 0, CARD_H]);
    }
    throw new Error(`The card area of "${cardArea}" is unknown in the "getSuitStyle()" function.`);
};

// Generates a vertical gradient that is evenly distributed between its component colors
const evenLinearGradient = (
    ctx: CanvasRenderingContext2D,
    colors: Array<string>,
    args: Array<number>,
) => {
    const grad = ctx.createLinearGradient(args[0], args[1], args[2], args[3]);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};
