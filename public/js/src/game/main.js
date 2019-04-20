/*
    The Hanabi game UI
*/

exports.chat = require('./chat');
exports.websocket = require('./websocket');
exports.sounds = require('./sounds');
exports.tooltips = require('./tooltips');

// Imports
const globals = require('../globals');
const HanabiUI = require('./ui/HanabiUI');
const misc = require('../misc');

$(document).ready(() => {
    // Disable the right-click context menu while in a game
    $('body').on('contextmenu', '#game', () => false);
});

exports.show = () => {
    globals.currentScreen = 'game';
    $('#page-wrapper').hide(); // We can't fade this out as it will overlap
    $('#game-chat-text').html(''); // Clear the in-game chat box of any previous content

    if (window.location.pathname === '/dev2') {
        // Do nothing and initialize later when we get the "init" message
        // TODO we can initialize the stage and some graphics here
    } else {
        $('#game').fadeIn(globals.fadeTime);
        globals.ui = new HanabiUI(globals, exports); // eslint-disable-line new-cap
        globals.chatUnread = 0;
    }
    globals.conn.send('hello');
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

    // Scroll to the bottom of the chat
    const chat = document.getElementById('lobby-chat-text');
    chat.scrollTop = chat.scrollHeight;
};
