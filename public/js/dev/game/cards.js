const constants = require('../constants');
const globals = require('../globals');

exports.init = () => {
    let { suits } = constants.VARIANT_INTEGER_MAPPING[globals.init.variant];

    // Add the grey suit, which represents cards of unknown suit
    suits = suits.concat(constants.SUIT.GRAY);

    for (const suit of suits) {
        // 0 is the stack base
        // 1-5 are the cards
        // 6 is a card of unknown rank
        for (let rank = 0; rank <= 6; rank++) {
            const cvs = document.createElement('canvas');
            cvs.width = constants.CARDW;
            cvs.height = constants.CARDH;

            const ctx = cvs.getContext('2d');

            if (rank > 0) {
                drawCardTexture(ctx);
            }

            drawCardBase(ctx, suit, rank);

            ctx.shadowBlur = 10;
            ctx.fillStyle = suit.style(ctx, constants.CARD_AREA.NUMBER);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            if (rank > 0 && rank < 6) {
                let textYPos;
                let indexLabel;
                let fontSize;
                if (globals.settings.showColorblindUI) {
                    fontSize = 68;
                    textYPos = 83;
                    indexLabel = suit.abbreviation + rank.toString();
                } else {
                    fontSize = 96;
                    textYPos = 110;
                    indexLabel = rank.toString();
                }

                ctx.font = `bold ${fontSize}pt Arial`;

                // Draw index on top left
                drawCardIndex(ctx, textYPos, indexLabel);

                // 'Index' cards are used to draw cards of learned but not yet known rank
                globals.ui.cards[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs);

                // Draw index on bottom right
                ctx.save();
                ctx.translate(constants.CARDW, constants.CARDH);
                ctx.rotate(Math.PI);
                drawCardIndex(ctx, textYPos, indexLabel);
                ctx.restore();
            }

            ctx.fillStyle = suit.style(ctx, constants.CARD_AREA.SYMBOL);

            ctx.lineWidth = 5;

            // Make the special corners on cards for the mixed variant
            if (suit.clueColors.length === 2) {
                drawMixedCardHelper(ctx, suit.clueColors);
            }

            // 'NoPip' cards are used for
            //   cards of known rank before suit learned
            //   cards of unknown rank
            // Entirely unknown cards (Gray 6) have a custom image defined separately
            if (rank > 0 && (rank < 6 || suit !== constants.SUIT.GRAY)) {
                globals.ui.cards[`NoPip-${suit.name}-${rank}`] = cloneCanvas(cvs);
            }

            if (suit !== constants.SUIT.GRAY) {
                drawSuitPips(ctx, rank, suit.shape);
            }

            // Gray Card images would be identical to NoPip images
            if (suit !== constants.SUIT.GRAY) {
                globals.ui.cards[`Card-${suit.name}-${rank}`] = cvs;
            }
        }
    }

    globals.ui.cards['NoPip-Gray-6'] = makeUnknownCardImage();
    globals.ui.cards['deck-back'] = makeDeckBack();
};

// Draw texture lines on a card
function drawCardTexture(ctx) {
    backpath(ctx, 4);

    ctx.fillStyle = 'white';
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = 'black';

    for (let x = 0; x < constants.CARDW; x += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, constants.CARDH);
        ctx.stroke();
    }

    for (let y = 0; y < constants.CARDH; y += 4 + Math.random() * 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(constants.CARDW, y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawCardBase(ctx, suit, rank) {
    // Draw the background
    ctx.fillStyle = suit.style(ctx, constants.CARD_AREA.BACKGROUND);
    ctx.strokeStyle = suit.style(ctx, constants.CARD_AREA.BACKGROUND);
    if (ctx.fillStyle === constants.COLOR.WHITE.hexCode) {
        ctx.strokeStyle = constants.COLOR.BLACK.hexCode;
    }

    backpath(ctx, 4);

    ctx.save();
    // Draw the borders (on visible cards) and the color fill
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 8;
    // The borders should be more opaque for the stack base.
    if (rank === 0) {
        ctx.globalAlpha = 1.0;
    }
    ctx.stroke();

    ctx.restore();
}

function drawCardIndex(ctx, textYPos, indexLabel) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fillText(indexLabel, 19, textYPos);
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.strokeText(indexLabel, 19, textYPos);
}

function cloneCanvas(oldCanvas) {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;
    const ctx = newCanvas.getContext('2d');
    ctx.drawImage(oldCanvas, 0, 0);
    return newCanvas;
}

function makeUnknownCardImage() {
    const cvs = document.createElement('canvas');
    cvs.width = constants.CARDW;
    cvs.height = constants.CARDH;

    const ctx = cvs.getContext('2d');

    drawCardTexture(ctx);

    ctx.fillStyle = 'black';

    backpath(ctx, 4);

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

    ctx.translate(constants.CARDW / 2, constants.CARDH / 2);

    return cvs;
}

function makeDeckBack() {
    const cvs = makeUnknownCardImage();
    const ctx = cvs.getContext('2d');

    const { suits } = constants.VARIANT_INTEGER_MAPPING[globals.init.variant];
    let i = 0;
    for (const suit of suits) {
        ctx.resetTransform();
        ctx.scale(0.4, 0.4);

        let x = Math.floor(constants.CARDW * 1.25);
        let y = Math.floor(constants.CARDH * 1.25);

        // Transform polar to cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        x -= 1.05 * Math.floor(constants.CARDW * 0.7 * Math.cos((-i / suits.length + 0.25) * Math.PI * 2) + constants.CARDW * 0.25);
        y -= 1.05 * Math.floor(constants.CARDW * 0.7 * Math.sin((-i / suits.length + 0.25) * Math.PI * 2) + constants.CARDW * 0.3);
        ctx.translate(x, y);

        constants.PATHFUNC.get(suit.shape)(ctx);
        drawShape(ctx);

        i += 1;
    }

    ctx.save();
    return cvs;
}

const drawMixedCardHelper = function drawMixedCardHelper(ctx, clueColors) {
    const [clueColor1, clueColor2] = clueColors;

    ctx.save();

    ctx.lineWidth = 1;

    const triangleSize = 50;
    const borderSize = 8;

    // Draw the first half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(constants.CARDW - borderSize, borderSize); // Start at the top right-hand corner
    ctx.lineTo(constants.CARDW - borderSize - triangleSize, borderSize); // Move left
    ctx.lineTo(constants.CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move down and right diagonally
    ctx.moveTo(constants.CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the top-right triangle
    ctx.beginPath();
    ctx.moveTo(constants.CARDW - borderSize, borderSize); // Start at the top right-hand corner
    ctx.lineTo(constants.CARDW - borderSize, borderSize + triangleSize); // Move down
    ctx.lineTo(constants.CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move up and left diagonally
    ctx.moveTo(constants.CARDW - borderSize, borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    // Draw the first half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, constants.CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize, constants.CARDH - borderSize - triangleSize); // Move up
    ctx.lineTo(borderSize + (triangleSize / 2), constants.CARDH - borderSize - (triangleSize / 2)); // Move right and down diagonally
    ctx.moveTo(borderSize, constants.CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor1.hexCode;
    drawShape(ctx);

    // Draw the second half of the bottom-left triangle
    ctx.beginPath();
    ctx.moveTo(borderSize, constants.CARDH - borderSize); // Start at the bottom right-hand corner
    ctx.lineTo(borderSize + triangleSize, constants.CARDH - borderSize); // Move right
    ctx.lineTo(borderSize + (triangleSize / 2), constants.CARDH - borderSize - (triangleSize / 2)); // Move left and up diagonally
    ctx.moveTo(borderSize, constants.CARDH - borderSize); // Move back to the beginning
    ctx.fillStyle = clueColor2.hexCode;
    drawShape(ctx);

    ctx.restore();
};

function drawSuitPips(ctx, rank, shape) {
    const pathFunc = constants.PATHFUNC.get(shape);
    const scale = 0.4;

    // The middle for cards 2 or 4
    if (rank === 1 || rank === 3) {
        ctx.save();
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Top and bottom for cards 2, 3, 4, 5
    if (rank > 1 && rank <= 5) {
        const symbolYPos = globals.settings.showColorblindUI ? 85 : 120;
        ctx.save();
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
        ctx.translate(0, -symbolYPos);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
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
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
        ctx.translate(-90, 0);
        ctx.scale(scale, scale);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();

        ctx.save();
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
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
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
        ctx.scale(scale * 3 / 2, scale * 3 / 2);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }

    // Unknown rank, so draw large faint suit
    if (rank === 6) {
        ctx.save();
        ctx.globalAlpha = globals.settings.showColorblindUI ? 0.4 : 0.1;
        ctx.translate(constants.CARDW / 2, constants.CARDH / 2);
        ctx.scale(scale * 3, scale * 3);
        ctx.translate(-75, -100);
        pathFunc(ctx);
        drawShape(ctx);
        ctx.restore();
    }
}

function backpath(ctx, p) {
    // Local constants
    const xrad = constants.CARDW * 0.08;
    const yrad = constants.CARDH * 0.08;

    ctx.beginPath();
    ctx.moveTo(p, yrad + p);
    ctx.lineTo(p, constants.CARDH - yrad - p);
    ctx.quadraticCurveTo(0, constants.CARDH, xrad + p, constants.CARDH - p);
    ctx.lineTo(constants.CARDW - xrad - p, constants.CARDH - p);
    ctx.quadraticCurveTo(constants.CARDW, constants.CARDH, constants.CARDW - p, constants.CARDH - yrad - p);
    ctx.lineTo(constants.CARDW - p, yrad + p);
    ctx.quadraticCurveTo(constants.CARDW, 0, constants.CARDW - xrad - p, p);
    ctx.lineTo(xrad + p, p);
    ctx.quadraticCurveTo(0, 0, p, yrad + p);
}

function drawShape(ctx) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.stroke();
}
