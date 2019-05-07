/*
    The Hanabi card grahpics are various HTML5 canvas drawings
    This file has various changes from the other "drawCards.js" as workarounds
    to avoid canvas2svg crashing
*/

// Imports
const C2S = require('../js/lib/canvas2svg');
const constants = require('../js/src/constants');
const drawPip = require('../js/src/game/ui/drawPip');

let nodeImports = {};

// Constants
const {
    CARD_H,
    CARD_W,
    COLORS,
    SUITS,
} = constants;

// The "drawAll()" function returns an object containing all of the drawn cards images
// (on individual canvases)
exports.drawAll = (variant, colorblind, canvasType, imports = null) => {
    nodeImports = imports;
    const cardImages = {};

    // Add the "unknown" suit to the list of suits for this variant
    // The uknown suit has semi-blank gray cards, representing unknown cards
    const suits = variant.suits.concat(SUITS.Unknown);

    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Rank 0 is the stack base
        // Rank 1-5 are the normal cards
        // Rank 6 is a card of unknown rank
        // Rank 7 is a "START" card (in the "Up or Down" variants)
        for (let rank = 0; rank <= 7; rank++) {
            const [cvs, ctx] = initCanvas(canvasType);

            // We don't need the cross texture pattern on the stack base
            if (rank !== 0) {
                drawCardTexture(ctx);
            }

            // Make the special corners on the cards for dual-color suits
            if (suit.clueColors.length === 2) {
                drawMixedCardHelper(ctx, suit.clueColors);
            }

            drawCardBase(ctx, suit);

            ctx.shadowBlur = 10;
            ctx.fillStyle = getSuitStyle(suit, ctx, 'number');
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            if (rank !== 0 && rank !== 6) {
                let textYPos;
                let rankLabel = rank.toString();
                if (rank === constants.START_CARD_RANK) {
                    rankLabel = 'S';
                }
                let fontSize;
                if (colorblind) {
                    rankLabel = suit.abbreviation + rankLabel;
                    fontSize = 68;
                    textYPos = 83;
                } else {
                    fontSize = 96;
                    textYPos = 110;
                }

                ctx.font = `bold ${fontSize}pt Arial`;

                // Draw the rank on the top left
                drawText(ctx, textYPos, rankLabel);

                // "Index" cards are used to draw cards of learned but not yet known rank
                // (e.g. for in-game replays)
                cardImages[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs, ctx, canvasType);

                // Draw the rank on the bottom right
                ctx.save();
                ctx.translate(CARD_W, CARD_H);
                ctx.rotate(Math.PI);
                drawText(ctx, textYPos, rankLabel);
                ctx.restore();
            }

            ctx.fillStyle = getSuitStyle(suit, ctx, 'symbol');
            ctx.lineWidth = 5;

            // "NoPip" cards are used for
            // - cards of known rank before suit learned
            // - cards of unknown rank
            // Entirely unknown cards (e.g. "NoPip-Unknown-6")
            // have a custom image defined separately
            if (rank > 0 && (rank < 6 || suit !== SUITS.Unknown)) {
                const cardImagesIndex = `NoPip-${suit.name}-${rank}`;
                cardImages[cardImagesIndex] = cloneCanvas(cvs, ctx, canvasType);
            }

            if (suit !== SUITS.Unknown) {
                drawSuitPips(ctx, rank, suit, colorblind);
            }

            // "Card-Unknown" images would be identical to "NoPip-Unknown" images
            if (suit !== SUITS.Unknown) {
                const cardImagesIndex = `Card-${suit.name}-${rank}`;
                cardImages[cardImagesIndex] = saveCanvas(cvs, ctx, canvasType);
            }
        }
    }

    {
        const [cvs, ctx] = makeUnknownCardImage(canvasType);
        const cardImagesIndex = 'NoPip-Unknown-6';
        cardImages[cardImagesIndex] = saveCanvas(cvs, ctx, canvasType);
    }
    {
        const [cvs, ctx] = makeDeckBack(variant, canvasType);
        const cardImagesIndex = 'deck-back';
        cardImages[cardImagesIndex] = saveCanvas(cvs, ctx, canvasType);
    }

    return cardImages;
};

const initCanvas = (canvasType) => {
    let cvs;
    let ctx;

    if (canvasType === 'normal') {
        cvs = document.createElement('canvas');
        cvs.width = CARD_W;
        cvs.height = CARD_H;
        ctx = cvs.getContext('2d');
    } else if (canvasType === 'SVG') {
        ctx = new C2S(CARD_W, CARD_H);
    } else if (canvasType === 'SVGNode') {
        const { document } = (new nodeImports.jsdom.JSDOM('')).window;
        ctx = new nodeImports.C2SNode({
            document,
            width: CARD_W,
            height: CARD_H,
        });
    }

    return [cvs, ctx];
};

const cloneCanvas = (oldCvs, oldCtx, canvasType) => {
    if (canvasType === 'normal') {
        const newCvs = document.createElement('canvas');
        newCvs.width = oldCvs.width;
        newCvs.height = oldCvs.height;
        const ctx = newCvs.getContext('2d');
        ctx.drawImage(oldCvs, 0, 0);
        return newCvs;
    }

    if (canvasType.startsWith('SVG')) {
        return oldCtx.getSerializedSvg();
    }

    return null;
};

const saveCanvas = (cvs, ctx, canvasType) => {
    if (canvasType === 'normal') {
        return cvs;
    }

    if (canvasType.startsWith('SVG')) {
        return ctx.getSerializedSvg();
    }

    return null;
};

const drawSuitPips = (ctx, rank, suit, colorblind) => {
    const pathFunc = drawPip(suit.pip);
    const scale = 0.4;

    // The middle for cards 2 or 4
    if (rank === 1 || rank === 3) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Top and bottom for cards 2, 3, 4, 5
    if (rank > 1 && rank <= 5) {
        const symbolYPos = colorblind ? 85 : 120;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(0, symbolYPos);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Left and right for cards 4 and 5
    if (rank === 4 || rank === 5) {
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.translate(90, 0);
        ctx.scale(scale, scale);
        ctx.rotate(Math.PI);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Size, position, and alpha adjustment for the central icon on stack base and 5
    if (rank === 0 || rank === 5) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 3 / 2, scale * 3 / 2);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = colorblind ? 0.4 : 0.1;
        ctx.translate(CARD_W / 2, CARD_H / 2);
        ctx.scale(scale * 3, scale * 3);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }
};

const makeUnknownCardImage = (canvasType) => {
    const [cvs, ctx] = initCanvas(canvasType);

    drawCardTexture(ctx);
    drawCardBase(ctx, constants.SUITS.Unknown, true)

    ctx.fillStyle = 'black';
    cardBorderPath(ctx, 4);

    ctx.globalAlpha = 0.5;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#444444';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.translate(CARD_W / 2, CARD_H / 2);

    return [cvs, ctx];
};

const makeDeckBack = (variant, canvasType) => {
    const [cvs, ctx] = makeUnknownCardImage(canvasType);
    const sf = 0.4; // Scale factor

    const nSuits = variant.suits.length;
    ctx.scale(sf, sf);
    for (let i = 0; i < variant.suits.length; i++) {
        const suit = variant.suits[i];

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        const x = -1.05 * Math.floor(CARD_W * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.25); // eslint-disable-line
        const y = -1.05 * Math.floor(CARD_W * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.3); // eslint-disable-line
        ctx.translate(x, y);

        drawPip(suit.pip)(ctx);
        drawShape(ctx);
        ctx.translate(-x, -y);
    }
    ctx.scale(1 / sf, 1 / sf);

    return [cvs, ctx];
};

const drawCardBase = (ctx, suit, black) => {
    // Draw the border (1/2; we need a white border first to clip)
    cardBorderPath(ctx);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.clip();

    // Draw the border (2/2; this is the colored border)
    ctx.fillStyle = getSuitStyle(suit, ctx, 'background');
    ctx.strokeStyle = getSuitStyle(suit, ctx, 'background');
    if (ctx.fillStyle === SUITS.White.fill || black) {
        ctx.strokeStyle = COLORS.Black.fill;
    }
    cardBorderPath(ctx);
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.globalAlpha = 1;
};

const cardBorderPath = (ctx) => {
    const xrad = CARD_W * 0.08;
    const yrad = CARD_W * 0.08;
    // (we want them to both have the same value so that the curve has a 45 degree angle)
    const radius = 50;
    ctx.beginPath();
    ctx.moveTo(0, yrad); // Top-left corner
    ctx.lineTo(0, CARD_H - yrad); // Bottom-left corner
    ctx.quadraticCurveTo(0, CARD_H, xrad, CARD_H);
    ctx.lineTo(CARD_W - xrad, CARD_H); // Bottom-right corner
    ctx.quadraticCurveTo(CARD_W, CARD_H, CARD_W, CARD_H - yrad);
    ctx.lineTo(CARD_W, yrad); // Top-right corner
    ctx.quadraticCurveTo(CARD_W, 0, CARD_W - xrad, 0);
    ctx.lineTo(xrad, 0); // Top-left corner
    ctx.quadraticCurveTo(0, 0, 0, yrad);
    ctx.closePath();
};

const drawShape = (ctx) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.stroke();
};

const drawText = (ctx, textYPos, indexLabel) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fillText(indexLabel, 19, textYPos);
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.strokeText(indexLabel, 19, textYPos);
};

const drawMixedCardHelper = (ctx, clueColors) => {
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
const drawCardTexture = (ctx) => {
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'black';

    for (let x = 0; x < CARD_W; x += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CARD_H);
        ctx.stroke();
    }

    for (let y = 0; y < CARD_H; y += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARD_W, y);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
};

const getSuitStyle = (suit, ctx, cardArea) => {
    // Nearly all suits have a solid fill
    if (suit.fill !== 'multi') {
        return suit.fill;
    }

    // Rainbow suits use a gradient fill, but the specific type of gradient will depend on the
    // specific element of the card that we are filling in
    if (cardArea === 'number') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 14, 0, 110]);
    }
    if (cardArea === 'symbol') {
        return evenRadialGradient(ctx, suit.fillColors, [75, 150, 25, 75, 150, 75]);
    }
    if (cardArea === 'background') {
        return evenLinearGradient(ctx, suit.fillColors, [0, 0, 0, constants.CARD_H]);
    }

    return null;
};

// Generates a vertical gradient that is evenly distributed between its component colors
const evenLinearGradient = (ctx, colors, args) => {
    const grad = ctx.createLinearGradient(...args);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};

// Generates a radial gradient that is evenly distributed between its component colors
const evenRadialGradient = (ctx, colors, args) => {
    const grad = ctx.createRadialGradient(...args);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};
