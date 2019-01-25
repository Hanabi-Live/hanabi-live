/*
    The Hanabi game UI
*/

exports.chat = require('./chat');
exports.commands = require('./commands');
exports.sounds = require('./sounds');
exports.tooltips = require('./tooltips');

// Imports
const globals = require('../globals');
const misc = require('../misc');
const ui = require('./ui/ui');

$(document).ready(() => {
    // Disable the right-click context menu while in a game
    $('body').on('contextmenu', '#game', () => false);
});

exports.show = () => {
    globals.currentScreen = 'game';

    $('#page-wrapper').hide(); // We can't fade this out as it will overlap
    $('#game').fadeIn(globals.fadeTime);

    // Clear the in-game chat box of any previous content
    $('#game-chat-text').html('');

    globals.ui = new ui(globals, exports); // eslint-disable-line new-cap
    globals.ui.setBackend(globals.conn);
};

exports.hide = () => {
    globals.currentScreen = 'lobby';

    globals.ui.destroy();
    globals.ui = null;

    $('#game').hide(); // We can't fade this out as it will overlap
    $('#page-wrapper').fadeIn(globals.fadeTime);

    // Make sure that there are not any game-related modals showing
    $('#game-chat-modal').hide();

    // Make sure that there are not any game-related tooltips showing
    misc.closeAllTooltips();

    // Scroll to the bottom of the lobby
    const chat = document.getElementById('lobby-chat-text');
    chat.scrollTop = chat.scrollHeight;
};

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.game = exports;
