// This script will draw a comparison between a SVG card and a canvas card

// Imports
const constants = require('../constants');

// Configuration
const suitName = 'Blue';
const rank = 5;
const cardName = `Card-${suitName}-${rank}`;
const variant = constants.VARIANTS['No Variant'];
const colorblindUI = false;

// Get the card images for both types
// const drawCardsSVG = require('./drawCards');
const drawCardsCanvas = require('../game/ui/drawCards');

// const cardImagesSVG = drawCardsSVG.drawAll(variant, colorblindUI, 'SVG');
const cardImagesCanvas = drawCardsCanvas.drawAll(variant, colorblindUI, 'normal');

// Draw one image from both types to the screen
$(document).ready(() => {
    // Draw the SVG card (left side)
    // const svg = cardImagesSVG[cardName];
    const svg1 = $($.parseHTML(`<img src='../../../img/cards/${cardName}.svg'>`));
    svg1.attr('id', 'svg1');
    $('body').append(svg1);

    // Put some spacing in between the cards
    $('body').append(' &nbsp; ');

    // Draw the canvas card (right side)
    const cvs = cardImagesCanvas[cardName];
    $('body').append(cvs);

    // Scale each image by half
    $('#svg1').width(constants.CARD_W / 2);
    $('#svg1').height(constants.CARD_H / 2);
    resizeTo(cvs, 0.50);
});

// From: https://stackoverflow.com/questions/34866171/resize-html-canvas-with-scale
function resizeTo(cvs, pct) {
    const tempCvs = document.createElement('canvas');
    const tctx = tempCvs.getContext('2d');
    const cw = cvs.width;
    const ch = cvs.height;
    tempCvs.width = cw;
    tempCvs.height = ch;
    tctx.drawImage(cvs, 0, 0);
    cvs.width *= pct;
    cvs.height *= pct;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(tempCvs, 0, 0, cw, ch, 0, 0, cw * pct, ch * pct);
    return tempCvs;
}
