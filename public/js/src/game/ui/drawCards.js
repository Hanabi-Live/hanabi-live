/*
    The Hanabi card grahpics are various HTML5 canvas drawings
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');

// Constants
const {
    CARD_AREA,
    CARD_H,
    CARD_W,
    COLOR,
    SUIT,
} = constants;
const xrad = CARD_W * 0.08;
const yrad = CARD_H * 0.08;

// The "drawAll()" function draws all of the cards and then stores them in the
// "globals.cardImages" object to be used later
exports.drawAll = () => {
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
            cvs.width = CARD_W;
            cvs.height = CARD_H;

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
                ctx.translate(CARD_W, CARD_H);
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
        ctx.translate(CARD_W / 2, CARD_H / 2);
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
        ctx.globalAlpha = 1.0;
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
        ctx.globalAlpha = globals.lobby.settings.showColorblindUI ? 0.4 : 0.1;
        ctx.translate(CARD_W / 2, CARD_H / 2);
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

        let x = Math.floor(CARD_W * 1.25);
        let y = Math.floor(CARD_H * 1.25);

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        x -= 1.05 * Math.floor(CARD_W * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.25); // eslint-disable-line
        y -= 1.05 * Math.floor(CARD_W * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARD_W * 0.3); // eslint-disable-line
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
    ctx.lineTo(p, CARD_H - yrad - p);
    ctx.quadraticCurveTo(0, CARD_H, xrad + p, CARD_H - p);
    ctx.lineTo(CARD_W - xrad - p, CARD_H - p);
    ctx.quadraticCurveTo(CARD_W, CARD_H, CARD_W - p, CARD_H - yrad - p);
    ctx.lineTo(CARD_W - p, yrad + p);
    ctx.quadraticCurveTo(CARD_W, 0, CARD_W - xrad - p, p);
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
    ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARD_W - borderSize - triangleSize, borderSize); // Move left
    ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move down and right diagonally
    ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(CARD_W - borderSize, borderSize); // Start at the top-right-hand corner
    ctx.lineTo(CARD_W - borderSize, borderSize + triangleSize); // Move down
    ctx.lineTo(CARD_W - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
    // Move up and left diagonally
    ctx.moveTo(CARD_W - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, CARD_H - borderSize - triangleSize); // Move up
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    // Move right and down diagonally
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, CARD_H - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, CARD_H - borderSize); // Move right
    ctx.lineTo(borderSize + (triangleSize / 2), CARD_H - borderSize - (triangleSize / 2));
    // Move left and up diagonally
    ctx.moveTo(borderSize, CARD_H - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    ctx.restore();
};

const makeUnknownCardImage = () => {
    const cvs = document.createElement('canvas');
    cvs.width = CARD_W;
    cvs.height = CARD_H;

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

    ctx.translate(CARD_W / 2, CARD_H / 2);

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

    ctx.restore();
};

const shapeFunctions = [
    // Diamond
    (ctx) => {
        const w = 70;
        const h = 80;

        // Expected bounding box requires these offsets
        const offsetX = 75 - w;
        const offsetY = 100 - h;
        const points = [
            [1, 0],
            [2, 1],
            [1, 2],
            [0, 1],
        ]
            .map(point => [point[0] * w + offsetX, point[1] * h + offsetY]);
        const curveX = 1.46;
        const curveY = 0.6;
        const interps = [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
        ]
            .map(v => [
                [curveX, 2 - curveX][v[0]] * w + offsetX,
                [curveY, 2 - curveY][v[1]] * h + offsetY,
            ]);

        ctx.beginPath();
        ctx.moveTo(...points[0]);
        ctx.quadraticCurveTo(...interps[0], ...points[1]);
        ctx.quadraticCurveTo(...interps[1], ...points[2]);
        ctx.quadraticCurveTo(...interps[2], ...points[3]);
        ctx.quadraticCurveTo(...interps[3], ...points[0]);
    },

    // Club
    (ctx) => {
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 4.712, true);
        ctx.arc(75, 50, 35, 1, 2.1416, true);
        ctx.arc(40, 110, 35, 4.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    },

    // Star
    (ctx) => {
        ctx.translate(75, 100);
        ctx.beginPath();
        ctx.moveTo(0, -75);
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -30);
            ctx.rotate(Math.PI / 5);
            ctx.lineTo(0, -75);
        }
    },

    // Heart
    (ctx) => {
        ctx.beginPath();
        ctx.moveTo(75, 65);
        ctx.bezierCurveTo(75, 57, 70, 45, 50, 45);
        ctx.bezierCurveTo(20, 45, 20, 82, 20, 82);
        ctx.bezierCurveTo(20, 100, 40, 122, 75, 155);
        ctx.bezierCurveTo(110, 122, 130, 100, 130, 82);
        ctx.bezierCurveTo(130, 82, 130, 45, 100, 45);
        ctx.bezierCurveTo(85, 45, 75, 57, 75, 65);
    },

    // Crescent
    (ctx) => {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 3, 4.3, true);
        ctx.arc(48, 83, 52, 5, 2.5, false);
    },

    // Spade
    (ctx) => {
        ctx.beginPath();
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 5.712, true);
        ctx.lineTo(75, 0);
        ctx.arc(40, 110, 35, 3.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
    },

    // Rainbow
    (ctx) => {
        ctx.beginPath();
        ctx.moveTo(0, 140);
        ctx.arc(75, 140, 75, Math.PI, 0, false);
        ctx.lineTo(125, 140);
        ctx.arc(75, 140, 25, 0, Math.PI, true);
        ctx.lineTo(0, 140);
    },
];

const drawSuitShape = (suit, i) => {
    // Suit shapes go in order from left to right, with the exception of rainbow suits,
    // which are always given a rainbow symbol
    if (suit === SUIT.RAINBOW || suit === SUIT.DARKRAINBOW) {
        // The final shape function in the array is the rainbow
        i = shapeFunctions.length - 1;
    }
    return shapeFunctions[i];
};
exports.drawSuitShape = drawSuitShape;
