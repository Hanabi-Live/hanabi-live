// Lobby keyboard shortcuts

/* eslint-disable unicorn/prefer-keyboard-event-key -- The hotkeys compare key codes. On macOS,
Alt + B gives a symbol in `event.key`, not "b". And `event.code` names the physical key, which moves
the hotkeys on French keyboards. */

import * as KeyCode from "keycode-js";
import { isModalVisible } from "../modals.ts";
import { store } from "../store.ts";
import * as createGame from "./createGame.ts";
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
  document.addEventListener("keydown", (event) => {
    // On a lobby page, submit its form if enter is pressed (unless it activates a focused button or
    // link, or adds a line to a text area), and only allow returning otherwise.
    if (lobbyPage.isShown() && !isModalVisible()) {
      // A page with a form has one submit button.
      const submitButton = document.querySelector<HTMLButtonElement>(
        '.lobby-page button[type="submit"]',
      );
      if (
        event.which === KeyCode.KEY_RETURN
        && submitButton !== null
        && !(
          document.activeElement instanceof HTMLButtonElement
          || document.activeElement instanceof HTMLAnchorElement
          || document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        event.preventDefault();
        submitButton.click();
      } else if (
        event.which === KeyCode.KEY_ESCAPE
        || (event.altKey && event.which === KeyCode.KEY_R)
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

    // We also account for macOS special characters that are inserted when you hold down the option
    // key.
    const state = store.getState();
    const { screen } = state.session;
    if (event.altKey && event.which === KeyCode.KEY_J) {
      // Alt + j. Join the first table that we can join, or the table that we are at.
      if (screen === Screen.Lobby) {
        const row = selectTableRows(state).find((value) => value.firstJoinable);
        if (row !== undefined) {
          tableJoin(row.table);
        }
      } else if (screen === Screen.PreGame) {
        const joinButton = selectJoinButton(state);
        if (joinButton.type === "join" && joinButton.enabled) {
          joinGame();
        }
      }
    } else if (event.altKey && event.which === KeyCode.KEY_N) {
      // Alt + n. Create a game.
      if (screen === Screen.Lobby && !state.session.creatingTable) {
        createGame.show();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_H) {
      // Alt + h. Show the history.
      if (screen === Screen.Lobby) {
        history.show();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_A) {
      // Alt + a. Watch a specific replay. (We can't use "Alt + w" because that conflicts with
      // LastPass.)
      if (screen === Screen.Lobby) {
        watchReplay.show();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_O) {
      // Alt + o. Sign out.
      if (screen === Screen.Lobby) {
        signOut();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_S) {
      // Alt + s. Start the game.
      if (screen === Screen.PreGame && selectCanStartGame(state)) {
        startGame();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_P) {
      // Alt + p. Spectate the game instead of playing it.
      const joinButton = selectJoinButton(state);
      if (
        screen === Screen.PreGame
        && joinButton.type === "spectate"
        && joinButton.enabled
      ) {
        spectateGame();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_C) {
      // Alt + c. Change the options.
      if (screen === Screen.PreGame) {
        createGame.show();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_L) {
      // Alt + l. Leave the game.
      if (screen === Screen.PreGame) {
        leaveGame();
      }
    } else if (
      (event.altKey && event.which === KeyCode.KEY_R)
      // If a modal is open, pressing escape should close it. Otherwise, pressing escape should go
      // "back" one screen.
      || event.which === KeyCode.KEY_ESCAPE
    ) {
      returnFromScreen(screen);
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
