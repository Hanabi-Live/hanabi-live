// Draw the SVG card
const drawCards = require('./drawCards');
drawCards.drawAll();

// Draw the canvas (old) card
const globals = require('../js/src/game/ui/globals');
const constants = require('../js/src/constants');
globals.variant = constants.VARIANTS['No Variant'];
globals.cardImages = {};
globals.lobby = {};
globals.lobby.settings = {};
globals.lobby.settings.showColorblindUI = false;
const drawCardsCanvas = require('../js/src/game/ui/drawCards');

drawCardsCanvas.drawAll();
$(document).ready(() => {
    const svg = globals.cardImages['Card-Blue-1'];
    $('body').append(svg);
});
