/*
    Functions having to do with drawing the cards
*/

// Imports
const globals = require('./globals');

// Constants
const {
    CARD_AREA,
    CARDH,
    CARDW,
    COLOR,
    SHAPE_FUNCTIONS,
    SUIT,
} = constants;
const xrad = CARDW * 0.08;
const yrad = CARDH * 0.08;

// Variables
let scaleCardImages = {};

exports.init = () => {
    scaleCardImages = {};
};

exports.buildCards = () => {
    // The gray suit represents cards of unknown suit
    const suits = globals.variant.suits.concat(SUIT.GRAY);
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Rank 0 is the stack base
        // Rank 1-5 are the normal cards
        // Rank 6 is a card of unknown rank
        // Rank 7 is a "START" card (in the "Up or Down" variants)
        for (let rank = 0; rank <= 7; rank++) {
            const cvs = document.createElement('canvas');
            cvs.width = CARDW;
            cvs.height = CARDH;

            const ctx = cvs.getContext('2d');

            if (rank > 0) {
                drawCardTexture(ctx);
            }

            drawCardBase(ctx, suit, rank);

            ctx.shadowBlur = 10;
            ctx.fillStyle = suit.style(ctx, CARD_AREA.NUMBER);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            if (rank !== 0 && rank !== 6) {
                let textYPos;
                let indexLabel;
                let rankString = rank.toString();
                if (rank === 7) {
                    // "START" cards are represented by rank 7
                    rankString = 'S';
                }
                let fontSize;
                if (globals.lobby.settings.showColorblindUI) {
                    fontSize = 68;
                    textYPos = 83;
                    indexLabel = suit.abbreviation + rankString;
                } else {
                    fontSize = 96;
                    textYPos = 110;
                    indexLabel = rankString;
                }

                ctx.font = `bold ${fontSize}pt Arial`;

                // Draw index on top left
                drawCardIndex(ctx, textYPos, indexLabel);

                // 'Index' cards are used to draw cards of learned but not yet known rank
                globals.cardImages[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs);

                // Draw index on bottom right
                ctx.save();
                ctx.translate(CARDW, CARDH);
                ctx.rotate(Math.PI);
                drawCardIndex(ctx, textYPos, indexLabel);
                ctx.restore();
            }

            ctx.fillStyle = suit.style(ctx, CARD_AREA.SYMBOL);

            ctx.lineWidth = 5;

            // Make the special corners on cards for the mixed variant
            if (suit.clueColors !== null && suit.clueColors.length === 2) {
                drawMixedCardHelper(ctx, suit.clueColors);
            }

            // 'NoPip' cards are used for
            //   cards of known rank before suit learned
            //   cards of unknown rank
            // Entirely unknown cards (Gray 6) have a custom image defined separately
            if (rank > 0 && (rank < 6 || suit !== SUIT.GRAY)) {
                globals.cardImages[`NoPip-${suit.name}-${rank}`] = cloneCanvas(cvs);
            }

            if (suit !== SUIT.GRAY) {
                drawSuitPips(ctx, rank, suit, i);
            }

            // Gray Card images would be identical to NoPip images
            if (suit !== SUIT.GRAY) {
                globals.cardImages[`Card-${suit.name}-${rank}`] = cvs;
            }
        }
    }

    globals.cardImages['NoPip-Gray-6'] = makeUnknownCardImage();
    globals.cardImages['deck-back'] = makeDeckBack();
};

const cloneCanvas = (oldCanvas) => {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;
    const context = newCanvas.getContext('2d');
    context.drawImage(oldCanvas, 0, 0);
    return newCanvas;
};

const drawSuitPips = (ctx, rank, suit, i) => {
    const pathFunc = drawSuitShape(suit, i);
    const scale = 0.4;

    // The middle for cards 2 or 4
    if (rank === 1 || rank === 3) {
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Top and bottom for cards 2, 3, 4, 5
    if (rank > 1 && rank <= 5) {
        const symbolYPos = globals.lobby.settings.showColorblindUI ? 85 : 120;
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
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
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
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
        ctx.globalAlpha = 1.0;
        ctx.save();
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale * 3 / 2, scale * 3 / 2);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = globals.lobby.settings.showColorblindUI ? 0.4 : 0.1;
        ctx.translate(CARDW / 2, CARDH / 2);
        ctx.scale(scale * 3, scale * 3);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }
};

const makeDeckBack = () => {
    const cvs = makeUnknownCardImage();
    const ctx = cvs.getContext('2d');

    const nSuits = globals.variant.suits.length;
    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];

        ctx.resetTransform();
        ctx.scale(0.4, 0.4);

        let x = Math.floor(CARDW * 1.25);
        let y = Math.floor(CARDH * 1.25);

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        x -= 1.05 * Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25); // eslint-disable-line
        y -= 1.05 * Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3); // eslint-disable-line
        ctx.translate(x, y);

        drawSuitShape(suit, i)(ctx);
        drawShape(ctx);
    }
    ctx.save();
    return cvs;
};

const drawCardBase = (ctx, suit, rank) => {
    // Draw the background
    ctx.fillStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
    ctx.strokeStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
    if (ctx.fillStyle === COLOR.WHITE.hexCode) {
        ctx.strokeStyle = COLOR.BLACK.hexCode;
    }

    backPath(ctx, 4);

    ctx.save();
    // Draw the borders (on visible cards) and the color fill
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    // The borders should be more opaque for the stack base
    if (rank === 0) {
        ctx.globalAlpha = 1.0;
    }
    ctx.stroke();

    ctx.restore();
};

const backPath = (ctx, p) => {
    ctx.beginPath();
    ctx.moveTo(p, yrad + p);
    ctx.lineTo(p, CARDH - yrad - p);
    ctx.quadraticCurveTo(0, CARDH, xrad + p, CARDH - p);
    ctx.lineTo(CARDW - xrad - p, CARDH - p);
    ctx.quadraticCurveTo(CARDW, CARDH, CARDW - p, CARDH - yrad - p);
    ctx.lineTo(CARDW - p, yrad + p);
    ctx.quadraticCurveTo(CARDW, 0, CARDW - xrad - p, p);
    ctx.lineTo(xrad + p, p);
    ctx.quadraticCurveTo(0, 0, p, yrad + p);
};

const drawShape = (ctx) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.stroke();
};

const drawCardIndex = (ctx, textYPos, indexLabel) => {
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
    ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARDW - borderSize - triangleSize, borderSize); // Move left
    ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move down and right diagonally
    ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARDW - borderSize, borderSize + triangleSize); // Move down
    ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move up and left diagonally
    ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, CARDH - borderSize - triangleSize); // Move up
    ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
    // Move right and down diagonally
    ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, CARDH - borderSize); // Move right
    ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
    // Move left and up diagonally
    ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    ctx.restore();
};

const makeUnknownCardImage = () => {
    const cvs = document.createElement('canvas');
    cvs.width = CARDW;
    cvs.height = CARDH;

    const ctx = cvs.getContext('2d');

    drawCardTexture(ctx);

    ctx.fillStyle = 'black';

    backPath(ctx, 4);

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

    ctx.translate(CARDW / 2, CARDH / 2);

    return cvs;
};

// Draw texture lines on card
const drawCardTexture = (ctx) => {
    backPath(ctx, 4, xrad, yrad);

    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'black';

    for (let x = 0; x < CARDW; x += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CARDH);
        ctx.stroke();
    }

    for (let y = 0; y < CARDH; y += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CARDW, y);
        ctx.stroke();
    }

    ctx.restore();
};

const drawSuitShape = (suit, i) => {
    // Suit shapes go in order from left to right, with the exception of rainbow suits,
    // which are always given a rainbow symbol
    if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
        // The final shape function in the array is the rainbow
        i = SHAPE_FUNCTIONS.length - 1;
    }
    return SHAPE_FUNCTIONS[i];
};
exports.drawSuitShape = drawSuitShape;

exports.scaleCardImage = (context, name, width, height, am) => {
    let src = globals.cardImages[name];

    if (!src) {
        console.error(`The image "${name}" was not generated.`);
        return;
    }

    const dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
    const dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

    if (dw < 1 || dh < 1) {
        return;
    }

    let sw = width;
    let sh = height;
    let steps = 0;

    if (!scaleCardImages[name]) {
        scaleCardImages[name] = [];
    }

    // Scaling the card down in steps of half in each dimension presumably improves the scaling?
    while (dw < sw / 2) {
        let scaleCanvas = scaleCardImages[name][steps];
        sw = Math.floor(sw / 2);
        sh = Math.floor(sh / 2);

        if (!scaleCanvas) {
            scaleCanvas = document.createElement('canvas');
            scaleCanvas.width = sw;
            scaleCanvas.height = sh;

            const scaleContext = scaleCanvas.getContext('2d');

            scaleContext.drawImage(src, 0, 0, sw, sh);

            scaleCardImages[name][steps] = scaleCanvas;
        }

        src = scaleCanvas;

        steps += 1;
    }

    context.drawImage(src, 0, 0, width, height);
};
