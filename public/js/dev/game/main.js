/*
    The Hanabi game UI
*/

require('pixi.js'); // pixi-tween is added automatically to the PIXI namespace
require('pixi-tween'); // pixi-tween is added automatically to the PIXI namespace
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
    $('#game').html(''); // Ensure that no old games will show while the new canvas loads
    $('#game').show();

    // Request the "init" message
    // TODO: combine the "hello" + "ready" message and the "gameStart" + "init" messages
    globals.conn.send('hello');

    // Now we will wait for the "init" message from the server before initializing the canvas
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
