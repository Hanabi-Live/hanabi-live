// This script will populate the card images directory with the SVG conversions
// This is meant to be run from NodeJS
// e.g. "node create-all-cards.js"

// Imports
const fs = require('fs');

const nodeImports = {
    jsdom: require('jsdom'),
    C2SNode: require('./lib/canvas2svg_node'),
};
const drawCardsSVG = require('./drawCards');
const allCardImages = {};
for (const variant of Object.values(constants.VARIANTS)) {
    let needSuitsFromThisVariant = false;
    for (const suit of variant.suits) {
        const key = `Card-${suit.name}-0`;
        if (!Object.hasOwnProperty.call(allCardImages, key)) {
            needSuitsFromThisVariant = true;
            break;
        }
    }
    if (!needSuitsFromThisVariant) {
        continue;
    }
    const cardImagesSVG = drawCardsSVG.drawAll(variant, colorblind, 'SVGNode', nodeImports);
    for (const key of Object.keys(cardImagesSVG)) {
        if (!Object.hasOwnProperty.call(allCardImages, key)) {
            allCardImages[key] = cardImagesSVG[key];
        }
    }
}
for (const key of Object.keys(allCardImages)) {
    const filePath = `../img/cards/${key}.svg`;
    try {
        nodeImports.fs.writeFileSync(filePath, allCardImages[key], 'utf8');
    } catch (err) {
        console.error(`Failed to write the SVG file "${filePath}:"`, err);
        return;
    }
}
