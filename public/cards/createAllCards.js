// This script will populate the card images directory with the SVG conversions
// This is meant to be run from NodeJS
// e.g. "node createAllCards.js"

// Imports
const fs = require('fs');
const constants = require('../js/src/constants');

const nodeImports = {
    jsdom: require('jsdom'),
    C2SNode: require('./lib/canvas2svg_node'),
};
const drawCardsSVG = require('./drawCards');

const allCardImages = {};
const numVariants = Object.keys(constants.VARIANTS).length;
for (const colorblind of [false, true]) {
    let i = 1;
    for (const variant of Object.values(constants.VARIANTS)) {
        let msg = `Getting variant: ${variant.name}`;
        if (colorblind) {
            msg += ' (colorblind)';
        }
        msg += ` - ${i} / ${numVariants}`;
        console.log(msg);
        let needSuitsFromThisVariant = false;
        for (const suit of variant.suits) {
            let key = `Card-${suit.name}-0`;
            if (colorblind) {
                key += '-Colorblind';
            }
            if (!Object.hasOwnProperty.call(allCardImages, key)) {
                needSuitsFromThisVariant = true;
                break;
            }
        }
        if (!needSuitsFromThisVariant) {
            console.log('Skipping.');
            continue;
        }
        const cardImagesSVG = drawCardsSVG.drawAll(variant, colorblind, 'SVGNode', nodeImports);
        for (const key of Object.keys(cardImagesSVG)) {
            let modifiedKey = key;
            if (colorblind) {
                modifiedKey += '-Colorblind';
            }
            console.log('modifiedKey:', modifiedKey);
            if (!Object.hasOwnProperty.call(allCardImages, modifiedKey)) {
                allCardImages[modifiedKey] = cardImagesSVG[key];
            }
        }

        i += 1;
    }
}

console.log('Finished created all card images.');

for (const key of Object.keys(allCardImages)) {
    const filePath = `../img/cards/${key}.svg`;
    try {
        fs.writeFileSync(filePath, allCardImages[key], 'utf8');
    } catch (err) {
        console.error(`Failed to write the SVG file "${filePath}:"`, err);
        return;
    }
    console.log('Wrote file:', filePath);
}

console.log('Completed!');
