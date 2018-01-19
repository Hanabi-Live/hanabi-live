/*
    The Hanabi game UI
*/

const pixi = require('pixi.js');
const globals = require('../globals');

$(document).ready(() => {
    // Disable the context menu that appears when a user right-clicks
    $('body').on('contextmenu', '#game', () => false);
});

exports.show = () => {
    globals.currentScreen = 'game';
    $('#game').fadeIn(globals.fadeTime);

    // The scroll bars appear for some reason when showing the game, which is annoying and wastes space
    $('body').css('overflow', 'hidden');

    // Initialize the canvas
    init();
};

const hide = () => {
    $('#game').html('');
    $('#game').hide();

    // Change the scroll bars for the page back to the default value
    $('body').css('overflow', 'visible');
};
exports.hide = hide;

const init = () => {
    const app = new pixi.Application(window.innerWidth, window.innerHeight);
    $('#game').append(app.view);
};

exports.end = () => {
    hide();
    globals.currentScreen = 'lobby';
    $('#page-wrapper').fadeIn(globals.fadeTime);
};
