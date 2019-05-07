// This script will draw a comparison between a SVG card and a canvas card

// Imports
const constants = require('../js/src/constants');

// Configuration
const suitName = 'Blue';
const rank = 5;
const cardName = `Index-${suitName}-${rank}`;
const variant = constants.VARIANTS['No Variant'];
const colorblind = false;

// Get the card images for both types
const drawCardsSVG = require('./drawCards');
const cardImagesSVG = drawCardsSVG.drawAll(variant, colorblind, 'SVG');
const drawCardsCanvas = require('../js/src/game/ui/drawCards');
const cardImagesCanvas = drawCardsCanvas.drawAll(variant, colorblind, 'normal');

// Draw one image from both types to the screen
$(document).ready(() => {
    // Draw the SVG card (left side)
    const svg = cardImagesSVG[cardName];
    $('body').append(svg);

    // Put some spacing in between the cards
    $('body').append(' &nbsp; ');

    // Draw the canvas card (right side)
    const ctx = cardImagesCanvas[cardName];
    $('body').append(ctx);
});
