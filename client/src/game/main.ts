// The Hanabi game UI

import { FADE_TIME } from '../constants';
import globals from '../globals';
import tablesDraw from '../lobby/tablesDraw';
import Screen from '../lobby/types/Screen';
import * as usersDraw from '../lobby/usersDraw';
import { closeAllTooltips } from '../misc';
import * as sounds from '../sounds';
import * as chat from './chat';
import * as cursor from './ui/cursor';
import HanabiUI from './ui/HanabiUI';

export const init = () => {
  $('#game').on('mouseenter mouseleave', () => {
    cursor.set('default');
  });
};

export const show = () => {
  globals.currentScreen = Screen.Game;
  $('#page-wrapper').hide(); // We can't fade this out as it will overlap
  $('#game-chat-text').html(''); // Clear the in-game chat box of any previous content
  $('body').on('contextmenu', () => false); // Disable the right-click context menu
  $('#game').fadeIn(FADE_TIME);

  // Every time a new game is opened, the UI is rebuilt from scratch
  globals.ui = new HanabiUI(globals, gameExports);
  globals.chatUnread = 0;

  // Request some high-level information about the game (e.g. the number of players and the variant)
  // The server will send us back an "init" message, which will contain enough information to start
  // drawing the UI (we will request the specific actions for the game later on)
  globals.conn!.send('getGameInfo1', {
    tableID: globals.tableID,
  });
};

export const hide = () => {
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw();

  if (globals.ui !== null) {
    globals.ui.destroy();
    globals.ui = null;
  }

  $('#game').hide(); // We can't fade this out as it will overlap
  $('body').off('contextmenu'); // Enable the right-click context menu
  $('#page-wrapper').fadeIn(FADE_TIME, () => {
    // Also account that we could be going back to one of the history screens
    // (we could have entered a solo replay from one of the history screens)
    if ($('#lobby-history').is(':visible')) {
      globals.currentScreen = Screen.History;
    } else if ($('#lobby-history-other-scores').is(':visible')) {
      globals.currentScreen = Screen.HistoryOtherScores;
    }
  });

  // Make sure that there are not any game-related modals showing
  $('#game-chat-modal').hide();

  // Make sure that there are not any game-related tooltips showing
  closeAllTooltips();

  // Scroll to the bottom of the chat
  const chatElement = document.getElementById('lobby-chat-text');
  if (chatElement === null) {
    throw new Error('Failed to get the "lobby-chat-text" element.');
  }
  chatElement.scrollTop = chatElement.scrollHeight;
};

// These are references to some functions and submodules that need to be interacted with in the UI
// code (e.g. hiding the UI, playing a sound)
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
