/*
    The Hanabi game UI
*/

const pixi = require('pixi.js');
const globals = require('../globals');
const scaleToWindow = require('./scaleToWindow');

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
    $('#game').fadeIn(globals.fadeTime);

    // The scroll bars appear for some reason when showing the game, which is annoying and wastes space
    $('body').css('overflow', 'hidden');

    // Initialize the canvas
    init();
};

const hide = () => {
    destroy();
    $('#game').hide();

    // Change the scroll bars for the page back to the default value
    $('body').css('overflow', 'visible');
};
exports.hide = hide;

const init = () => {
    globals.app = new pixi.Application({
        width: window.innerWidth,
        height: window.innerHeight,
    });
    $('#game').append(globals.app.view);

    const backgroundTexture = pixi.Texture.fromImage('public/img/background.jpg');
};

const destroy = () => {
    // http://pixijs.download/release/docs/PIXI.Application.html#destroy
    globals.app.destroy(true);
};

exports.end = () => {
    hide();
    globals.currentScreen = 'lobby';
    $('#page-wrapper').fadeIn(globals.fadeTime);
};
