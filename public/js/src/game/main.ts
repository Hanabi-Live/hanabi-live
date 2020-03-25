/*
    The Hanabi game UI
*/

// Imports
import * as chat from './chat';
import { FADE_TIME } from '../constants';
import globals from '../globals';
import HanabiUI from './ui/HanabiUI';
import * as misc from '../misc';
import * as sounds from './sounds';
import tablesDraw from '../lobby/tablesDraw';
import usersDraw from '../lobby/usersDraw';

export const init = () => {
    // Disable the right-click context menu while in a game
    $('body').on('contextmenu', '#game', () => false);
};

export const show = () => {
    globals.currentScreen = 'game';
    $('#page-wrapper').hide(); // We can't fade this out as it will overlap
    $('#game-chat-text').html(''); // Clear the in-game chat box of any previous content

    if (window.location.pathname === '/dev2') {
        // Do nothing and initialize later when we get the "init" message
        // TODO we can initialize the stage and some graphics here
    } else {
        $('#game').fadeIn(FADE_TIME);
        globals.ui = new HanabiUI(globals, gameExports);
        globals.chatUnread = 0;
    }
    globals.conn.send('hello');
};

export const hide = () => {
    globals.currentScreen = 'lobby';
    tablesDraw();
    usersDraw();

    globals.ui.destroy();
    globals.ui = null;

    $('#game').hide(); // We can't fade this out as it will overlap
    $('#page-wrapper').fadeIn(FADE_TIME, () => {
        // Also account that we could be going back to the history screen
        // or the history details screen
        // (if we entered a solo replay from the history screen / history details screen)
        if ($('#lobby-history').is(':visible')) {
            globals.currentScreen = 'history';
        } else if ($('#lobby-history-other-scores').is(':visible')) {
            globals.currentScreen = 'historyOtherScores';
        }
    });

    // Make sure that there are not any game-related modals showing
    $('#game-chat-modal').hide();

    // Make sure that there are not any game-related tooltips showing
    misc.closeAllTooltips();

    // Scroll to the bottom of the chat
    const chatElement = document.getElementById('lobby-chat-text');
    if (chatElement === null) {
        throw new Error('Failed to get the "lobby-chat-text" element.');
    }
    chatElement.scrollTop = chatElement.scrollHeight;
};

// These are references to some functions and submodules that need to be interacted with
// in the UI code (e.g. hiding the UI, playing a sound)
const gameExports = {
    hide,
    chat,
    sounds,
};
