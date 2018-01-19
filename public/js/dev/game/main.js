/*
    The Hanabi game UI
*/

const globals = require('../globals');

$(document).ready(() => {
    // Disable the context menu that appears when a user right-clicks
    $('body').on('contextmenu', '#game', () => false);
});

exports.show = () => {
    $('#game').fadeIn(globals.fadeTime);

    // The scroll bars appear for some reason when showing the game, which is annoying and wastes space
    $('body').css('overflow', 'hidden');

    // Draw some crap on the canvas
    init();
};

const hide = () => {
    $('#game').hide();

    // Change the scroll bars for the page back to the default value
    $('body').css('overflow', 'visible');
};
exports.hide = hide;

const init = () => {
    let app = new PIXI.Application({width: 256, height: 256});

};

exports.end = () => {
    hide();
    $('#page-wrapper').fadeIn(globals.fadeTime);
    globals.currentScreen = 'lobby';
};
