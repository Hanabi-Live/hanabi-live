const textShapes = [
    'flower',
    'number_sign',
    'tensor_symbol',
    'infinity',
    'null_symbol',
];

const shapeFunctions = {
    diamond: (ctx) => {
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
        ].map(point => [point[0] * w + offsetX, point[1] * h + offsetY]);
        const curveX = 1.46;
        const curveY = 0.6;
        const interps = [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
        ].map(v => [
            [curveX, 2 - curveX][v[0]] * w + offsetX,
            [curveY, 2 - curveY][v[1]] * h + offsetY,
        ]);

        ctx.beginPath();
        ctx.moveTo(...points[0]);
        ctx.quadraticCurveTo(...interps[0], ...points[1]);
        ctx.quadraticCurveTo(...interps[1], ...points[2]);
        ctx.quadraticCurveTo(...interps[2], ...points[3]);
        ctx.quadraticCurveTo(...interps[3], ...points[0]);
        ctx.closePath();
    },

    club: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 4.712, true);
        ctx.arc(75, 50, 35, 1, 2.1416, true);
        ctx.arc(40, 110, 35, 4.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
        ctx.closePath();
    },

    star: (ctx) => {
        // From: https://stackoverflow.com/questions/25837158/how-to-draw-a-star-by-using-canvas-html5
        let rot = Math.PI / 2 * 3;
        const cx = 75;
        const cy = 100;
        const outerRadius = 75;
        const innerRadius = 30;
        const step = Math.PI / 5;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < 5; i++) {
            const x1 = cx + Math.cos(rot) * outerRadius;
            const y1 = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x1, y1);
            rot += step;

            const x2 = cx + Math.cos(rot) * innerRadius;
            const y2 = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x2, y2);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    },

    heart: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(75, 65);
        ctx.bezierCurveTo(75, 57, 70, 45, 50, 45);
        ctx.bezierCurveTo(20, 45, 20, 82, 20, 82);
        ctx.bezierCurveTo(20, 100, 40, 122, 75, 155);
        ctx.bezierCurveTo(110, 122, 130, 100, 130, 82);
        ctx.bezierCurveTo(130, 82, 130, 45, 100, 45);
        ctx.bezierCurveTo(85, 45, 75, 57, 75, 65);
        ctx.closePath();
    },

    crescent: (ctx) => {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 3, 4.3, true);
        ctx.arc(48, 83, 52, 5, 2.5, false);
        ctx.closePath();
    },

    flower: (ctx) => {
        ctx.text = '✿';
        ctx.font = '190px Verdana';
        ctx.textX = -10;
        ctx.textY = 155;
    },

    spade: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(50, 180);
        ctx.lineTo(100, 180);
        ctx.quadraticCurveTo(80, 140, 75, 120);
        ctx.arc(110, 110, 35, 2.6779, 5.712, true);
        ctx.lineTo(75, 0);
        ctx.arc(40, 110, 35, 3.712, 0.4636, true);
        ctx.quadraticCurveTo(70, 140, 50, 180);
        ctx.closePath();
    },

    number_sign: (ctx) => {
        ctx.text = '#';
        ctx.font = '190px Verdana';
        ctx.textX = -3;
        ctx.textY = 170;
    },

    circle: (ctx) => {
        ctx.beginPath();
        ctx.arc(75, 100, 75, 0, 2 * Math.PI);
        ctx.closePath();
    },

    tensor_symbol: (ctx) => {
        ctx.text = '⊗';
        ctx.font = '170px Verdana';
        ctx.textX = -9;
        ctx.textY = 150;
    },

    infinity: (ctx) => {
        ctx.text = '∞';
        ctx.font = '175px Verdana';
        ctx.textX = -10;
        ctx.textY = 155;
    },

    null_symbol: (ctx) => {
        ctx.text = '∅';
        ctx.font = '210px Verdana';
        ctx.textX = 10;
        ctx.textY = 165;
    },

    rainbow: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(0, 140);
        ctx.arc(75, 140, 75, Math.PI, 0, false);
        ctx.lineTo(125, 140);
        ctx.arc(75, 140, 25, 0, Math.PI, true);
        ctx.lineTo(0, 140);
        ctx.closePath();
    },
};

module.exports = (ctx, suit, shadow, deckBack) => {
    // Each suit has a shape defined in the "suits.json" file (as the "pip" property)
    // Draw the respective shape on the canvas
    // (or, for text pips, define the type of text)
    shapeFunctions[suit.pip](ctx);

    // Some pips are canvas line drawings and some pips are text characters
    const isTextShape = textShapes.includes(suit.pip);

    // Determine the fill
    if (deckBack) {
        // Pips on the back of the deck should be gray
        ctx.fillStyle = '#444444';
    } else if (suit.fill === 'multi') {
        // Rainbow and omni cards have a gradient fill
        ctx.fillStyle = evenRadialGradient(ctx, suit.fillColors, [75, 150, 25, 75, 150, 75]);
    } else {
        // All other suits have a solid fill
        ctx.fillStyle = suit.fill;
    }

    // Fill in the shape
    if (shadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    }
    if (isTextShape) {
        ctx.fillText(ctx.text, ctx.textX, ctx.textY);
    } else {
        ctx.fill();
    }

    // Draw a black border around the shape
    ctx.lineWidth = deckBack ? 8 : 5;
    if (shadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    }
    if (isTextShape) {
        ctx.strokeText(ctx.text, ctx.textX, ctx.textY);
    } else {
        ctx.stroke();
    }
};

// Generates a radial gradient that is evenly distributed between its component colors
const evenRadialGradient = (ctx, colors, args) => {
    const grad = ctx.createRadialGradient(...args);
    for (let i = 0; i < colors.length; ++i) {
        grad.addColorStop(i / (colors.length - 1), colors[i]);
    }
    return grad;
};
