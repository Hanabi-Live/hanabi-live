// The Hanabi game UI

import { FADE_TIME } from '../constants';
import globals from '../globals';
import tablesDraw from '../lobby/tablesDraw';
import * as usersDraw from '../lobby/usersDraw';
import * as misc from '../misc';
import * as sounds from '../sounds';
import * as chat from './chat';
import HanabiUI from './ui/HanabiUI';

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

  // Request some high-level information about the game (e.g. the number of players)
  // This will be enough information to load the UI
  // (we will request the specific actions for the game later on)
  globals.conn!.send('getGameInfo1', {
    tableID: globals.tableID,
  });
};

export const hide = () => {
  globals.currentScreen = 'lobby';
  tablesDraw();
  usersDraw.draw();

  if (globals.ui !== null) {
    globals.ui.destroy();
    globals.ui = null;
  }

  $('#game').hide(); // We can't fade this out as it will overlap
  $('#page-wrapper').fadeIn(FADE_TIME, () => {
    // Also account that we could be going back to one of the history screens
    // (we could have entered a solo replay from one of the history screens)
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
export interface GameExports {
  hide: () => void;
  chat: typeof chat;
  sounds: typeof sounds;
}
const gameExports: GameExports = {
  hide,
  chat,
  sounds,
};
