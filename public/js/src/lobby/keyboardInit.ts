// Lobby keyboard shortcuts

// Imports
import globals from '../globals';
import * as modals from '../modals';

export default () => {
  $(document).keydown((event) => {
    // On the "Create Game" tooltip, submit the form if enter is pressed
    if (
      event.key === 'Enter'
      && $('#create-game-tooltip-title').is(':visible')
      && !$('.ss-search').is(':visible') // Make an exception if the variant dropdown is open
    ) {
      event.preventDefault();
      $('#create-game-submit').click();
    }

    // The rest of the lobby hotkeys only use alt;
    // do not do anything if other modifiers are pressed
    if (event.ctrlKey || event.shiftKey || event.metaKey) {
      return;
    }

    // We also account for MacOS special characters that are inserted when
    // you hold down the option key
    if (event.altKey && (event.key === 'j' || event.key === '∆')) { // Alt + j
      // Click on the first "Join" button in the table list
      if (globals.currentScreen === 'lobby') {
        $('.lobby-games-first-join-button').click();
      }
    } else if (event.altKey && (event.key === 'c' || event.key === 'ç')) { // Alt + c
      // Click the "Create Game" button
      if (globals.currentScreen === 'lobby') {
        $('#nav-buttons-games-create-game').click();
      }
    } else if (event.altKey && (event.key === 'h' || event.key === '˙')) { // Alt + h
      // Click the "Show History" button
      if (globals.currentScreen === 'lobby') {
        $('#nav-buttons-games-history').click();
      }
    } else if (event.altKey && (event.key === 'a' || event.key === 'å')) { // Alt + a
      // Click on the "Watch Specific Replay" button
      // (we can't use "Alt + w" because that conflicts with LastPass)
      if (globals.currentScreen === 'lobby') {
        $('#nav-buttons-games-replay').click();
      }
    } else if (event.altKey && (event.key === 'o' || event.key === 'ø')) { // Alt + o
      // Click the "Sign Out" button
      if (globals.currentScreen === 'lobby') {
        $('#nav-buttons-games-sign-out').click();
      }
    } else if (event.altKey && (event.key === 's' || event.key === 'ß')) { // Alt + s
      // Click on the "Start Game" button
      if (globals.currentScreen === 'pregame') {
        $('#nav-buttons-pregame-start').click();
      }
    } else if (event.altKey && (event.key === 'l' || event.key === '¬')) { // Alt + l
      // Click on the "Leave Game" button
      if (globals.currentScreen === 'pregame') {
        $('#nav-buttons-pregame-leave').click();
      }
    } else if (event.altKey && (event.key === 'r' || event.key === '®')) { // Alt + r
      clickReturnToLobby();
    } else if (event.key === 'Escape') {
      // If a modal is open, pressing escape should close it
      // Otherwise, pressing escape should go "back" one screen
      if (globals.modalShowing) {
        modals.closeAll();
      } else {
        clickReturnToLobby();
      }
    }
  });
};

const clickReturnToLobby = () => {
  // Click on the "Return to Lobby" button
  // (either at the "game" screen or the "history" screen or the "scores" screen)
  if (globals.currentScreen === 'pregame') {
    $('#nav-buttons-pregame-unattend').click();
  } else if (globals.currentScreen === 'history') {
    $('#nav-buttons-history-return').click();
  } else if (globals.currentScreen === 'historyOtherScores') {
    $('#nav-buttons-history-other-scores-return').click();
  }
};
