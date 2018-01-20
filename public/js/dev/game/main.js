/*
    The Hanabi game UI
*/

const globals = require('../globals');
const scaleToWindow = require('./scaleToWindow');
const init = require('./init');

$(document).ready(() => {
    // Disable the context menu that appears when a user right-clicks
    $('body').on('contextmenu', '#game', () => false);

    // Automatically resize the game canvas if the window is resized
    window.addEventListener('resize', () => {
        if (globals.currentScreen === 'game') {
            scaleToWindow(globals.app.view);
        }
    });
});

exports.show = () => {
    globals.currentScreen = 'game';
    $('#game').show();

    // The scroll bars appear for some reason when showing the game, which is annoying and wastes space
    $('body').css('overflow', 'hidden');

    init.canvas();
};

const hide = () => {
    destroy();
    $('#game').hide();

    // Change the scroll bars for the page back to the default value
    $('body').css('overflow', 'visible');
};
exports.hide = hide;

const destroy = () => {
    // http://pixijs.download/release/docs/PIXI.Application.html#destroy
    globals.app.destroy(true); // And remove it from the DOM
};

exports.end = () => {
    hide();
    globals.currentScreen = 'lobby';
    $('#page-wrapper').fadeIn(globals.fadeTime);
};
