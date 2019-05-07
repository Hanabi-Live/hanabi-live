// Constants
const suitName = 'Unknown';
// const suitName = 'Blue';
const rank = 5;

// Draw the SVG card
const drawCards = require('./drawCards');
drawCards.drawAll();

$(document).ready(() => {
    const cardName = `${suitName.replace(/ /g,'')}-${rank}`;
    const svg = drawCards.cardImages[cardName].getSerializedSvg();
    $('body').append(svg);
    // console.log(svg);
});

// Draw the canvas (old) card
const globals = require('../js/src/game/ui/globals');
const constants = require('../js/src/constants');
// globals.variant = constants.VARIANTS['No Variant'];
globals.variant = constants.VARIANTS['Dual-Color (6 Suits)'];
globals.cardImages = {};
globals.lobby = {};
globals.lobby.settings = {};
globals.lobby.settings.showColorblindUI = false;
const drawCardsCanvas = require('../js/src/game/ui/drawCards');

drawCardsCanvas.drawAll();
$(document).ready(() => {
    const svg = globals.cardImages[`Index-Purple-${rank}`];
    $('body').append(' &nbsp; ');
    $('body').append(svg);
});

/*
// Draw the SVG card (node)
const drawCards = require('./drawCards_server');
drawCards.drawAll();
*/
