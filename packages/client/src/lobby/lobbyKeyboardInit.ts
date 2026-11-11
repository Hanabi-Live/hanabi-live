// Lobby keyboard shortcuts

import * as KeyCode from "keycode-js";
import { globals } from "../Globals.ts";
import { isModalVisible } from "../modals.ts";
import * as lobbyPage from "./lobbyPage.ts";
import { Screen } from "./types/Screen.ts";

export function lobbyKeyboardInit(): void {
  $(document).keydown((event) => {
    // On a lobby page, submit its form if enter is pressed (unless it activates a focused button or
    // link, or adds a line to a text area), and only allow returning otherwise.
    if (lobbyPage.isShown() && !isModalVisible()) {
      const submitButton = lobbyPage.getSubmitButton();
      if (
        event.which === KeyCode.KEY_RETURN
        && submitButton !== undefined
        && !(
          document.activeElement instanceof HTMLButtonElement
          || document.activeElement instanceof HTMLAnchorElement
          || document.activeElement instanceof HTMLTextAreaElement
        )
      ) {
        event.preventDefault();
        clickElement(submitButton);
      } else if (
        event.which === KeyCode.KEY_ESCAPE
        || (event.altKey && event.which === KeyCode.KEY_R)
      ) {
        clickElement("#nav-buttons-page-return");
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
    if (event.altKey && event.which === KeyCode.KEY_J) {
      // Alt + j.
      if (globals.currentScreen === Screen.Lobby) {
        // Click on the first "Join" button in the table list.
        clickElement(".lobby-games-join-first-table-button");
      } else if (globals.currentScreen === Screen.PreGame) {
        // Click on the "Join Game" button.
        clickElement("#nav-buttons-pregame-join");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_N) {
      // Alt + n. Click the "Create Game" button.
      if (globals.currentScreen === Screen.Lobby) {
        clickElement("#nav-buttons-lobby-create-game");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_H) {
      // Alt + h. Click the "Show History" button.
      if (globals.currentScreen === Screen.Lobby) {
        clickElement("#nav-buttons-lobby-history");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_A) {
      // Alt + a. Click on the "Watch Specific Replay" button. (We can't use "Alt + w" because that
      // conflicts with LastPass.)
      if (globals.currentScreen === Screen.Lobby) {
        clickElement("#nav-buttons-lobby-replay");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_O) {
      // Alt + o. Click the "Sign Out" button.
      if (globals.currentScreen === Screen.Lobby) {
        clickElement("#nav-buttons-lobby-sign-out");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_S) {
      // Alt + s. Click on the "Start Game" button.
      if (globals.currentScreen === Screen.PreGame) {
        clickElement("#nav-buttons-pregame-start");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_P) {
      // Alt + p. Click on the "Spectate Game" button.
      if (globals.currentScreen === Screen.PreGame) {
        clickElement("#nav-buttons-pregame-spectate");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_C) {
      // Alt + c. Click on the "Change Options" button.
      if (globals.currentScreen === Screen.PreGame) {
        clickElement("#nav-buttons-pregame-change-options");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_L) {
      // Alt + l. Click on the "Leave Game" button.
      if (globals.currentScreen === Screen.PreGame) {
        clickElement("#nav-buttons-pregame-leave");
      }
    } else if (event.altKey && event.which === KeyCode.KEY_R) {
      // Alt + r
      clickReturnToLobby();
    } else if (event.which === KeyCode.KEY_ESCAPE) {
      // If a modal is open, pressing escape should close it. Otherwise, pressing escape should go
      // "back" one screen.
      clickReturnToLobby();
    }
  });
}

function clickReturnToLobby() {
  // Click on the "Return to Lobby" button. (Either at the "game" screen or the "history" screen or
  // the "scores" screen.)
  switch (globals.currentScreen) {
    case Screen.PreGame: {
      clickElement("#nav-buttons-pregame-unattend");
      break;
    }

    case Screen.History: {
      clickElement("#nav-buttons-history-return");
      break;
    }

    case Screen.HistoryOtherScores: {
      clickElement("#nav-buttons-history-other-scores-return");
      break;
    }

    default: {
      break;
    }
  }
}

/**
 * Use a native click so that handlers registered with `addEventListener` also run. The jQuery
 * `trigger("click")` method does not perform a native click on links.
 */
function clickElement(selector: string) {
  document.querySelector<HTMLElement>(selector)?.click();
}
