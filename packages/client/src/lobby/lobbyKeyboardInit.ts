// Lobby keyboard shortcuts

import { getHotkeyLetter, loadKeyboardLayout } from "../hotkeyLetter.ts";
import { isModalVisible } from "../modals.ts";
import { store } from "../store.ts";
import { showCreateGame } from "./createGame.ts";
import * as history from "./history.ts";
import * as lobbyPage from "./lobbyPage.ts";
import {
  joinGame,
  leaveGame,
  returnToLobby,
  selectCanStartGame,
  selectJoinButton,
  spectateGame,
  startGame,
} from "./nav/navActions.ts";
import { signOut } from "./signOut.ts";
import { tableJoin } from "./tables/tableActions.ts";
import { selectTableRows } from "./tables/tablesSlice.ts";
import { Screen } from "./types/Screen.ts";
import * as watchReplay from "./watchReplay/WatchReplay.tsx";

export function lobbyKeyboardInit(): void {
  loadKeyboardLayout();
  document.addEventListener("keydown", (event) => {
    // On a lobby page, submit its form if enter is pressed (unless it activates a focused button or
    // link, or adds a line to a text area), and only allow returning otherwise.
    if (lobbyPage.isShown() && !isModalVisible()) {
      // A page with a form has one submit button.
      const submitButton = document.querySelector<HTMLButtonElement>(
        '.lobby-page button[type="submit"]',
      );
      if (
        submitButton !== null
        && event.key === "Enter"
        && !(
          document.activeElement instanceof HTMLButtonElement
          || document.activeElement instanceof HTMLAnchorElement
          || document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        event.preventDefault();
        submitButton.click();
      } else if (
        event.key === "Escape"
        || (event.altKey && getHotkeyLetter(event) === "r")
      ) {
        lobbyPage.hide();
      }
      return;
    }

    // The rest of the lobby hotkeys only use alt; do not do anything if other modifiers are pressed
    // or if a modal is open.
    if (event.ctrlKey || event.shiftKey || event.metaKey || isModalVisible()) {
      return;
    }

    const state = store.getState();
    const { screen } = state.session;

    // If a modal is open, pressing escape should close it. Otherwise, pressing escape should go
    // "back" one screen.
    if (event.key === "Escape") {
      returnFromScreen(screen);
      return;
    }

    if (!event.altKey) {
      return;
    }

    // On macOS, Option + a letter types a symbol, so `getHotkeyLetter` finds the letter.
    switch (getHotkeyLetter(event)) {
      case "j": {
        // Alt + j. Join the first table that we can join, or the table that we are at.
        if (screen === Screen.Lobby) {
          const row = selectTableRows(state).find(
            (value) => value.firstJoinable,
          );
          if (row !== undefined) {
            tableJoin(row.table);
          }
        } else if (screen === Screen.PreGame) {
          const joinButton = selectJoinButton(state);
          if (joinButton.type === "join" && joinButton.enabled) {
            joinGame();
          }
        }
        break;
      }

      case "n": {
        // Alt + n. Create a game.
        if (screen === Screen.Lobby && !state.session.creatingTable) {
          showCreateGame();
        }
        break;
      }

      case "h": {
        // Alt + h. Show the history.
        if (screen === Screen.Lobby) {
          history.show();
        }
        break;
      }

      case "a": {
        // Alt + a. Watch a specific replay. (We can't use "Alt + w" because that conflicts with
        // LastPass.)
        if (screen === Screen.Lobby) {
          watchReplay.show();
        }
        break;
      }

      case "o": {
        // Alt + o. Sign out.
        if (screen === Screen.Lobby) {
          signOut();
        }
        break;
      }

      case "s": {
        // Alt + s. Show the settings in the lobby, or start the game in a pre-game.
        if (screen === Screen.Lobby) {
          lobbyPage.show("settings");
        } else if (screen === Screen.PreGame && selectCanStartGame(state)) {
          startGame();
        }
        break;
      }

      case "p": {
        // Alt + p. Spectate the game instead of playing it.
        const joinButton = selectJoinButton(state);
        if (
          screen === Screen.PreGame
          && joinButton.type === "spectate"
          && joinButton.enabled
        ) {
          spectateGame();
        }
        break;
      }

      case "c": {
        // Alt + c. Change the options.
        if (screen === Screen.PreGame) {
          showCreateGame();
        }
        break;
      }

      case "l": {
        // Alt + l. Leave the game.
        if (screen === Screen.PreGame) {
          leaveGame();
        }
        break;
      }

      // Alt + r. Go "back" one screen, as escape does.
      case "r": {
        returnFromScreen(screen);
        break;
      }

      default: {
        break;
      }
    }
  });
}

/** Returns to the lobby from the pregame screen or from a history screen. */
function returnFromScreen(screen: Screen) {
  switch (screen) {
    case Screen.PreGame: {
      returnToLobby();
      break;
    }

    case Screen.History: {
      history.hide();
      break;
    }

    case Screen.HistoryOtherScores: {
      history.hideOtherScores();
      break;
    }

    default: {
      break;
    }
  }
}
