// Lobby keyboard shortcuts

import * as KeyCode from "keycode-js";
import globals from "../globals";
import Screen from "./types/Screen";

export default function keyboardInit(): void {
  $(document).keydown((event) => {
    // On the "Create Game" tooltip, submit the form if enter is pressed
    if (
      event.which === KeyCode.KEY_RETURN &&
      $("#create-game-tooltip-title").is(":visible") &&
      !$(".ss-search").is(":visible") // Make an exception if the variant dropdown is open
    ) {
      event.preventDefault();
      $("#create-game-submit").click();
    }

    // The rest of the lobby hotkeys only use alt;
    // do not do anything if other modifiers are pressed
    if (event.ctrlKey || event.shiftKey || event.metaKey) {
      return;
    }

    // We also account for MacOS special characters that are inserted when
    // you hold down the option key
    if (event.altKey && event.which === KeyCode.KEY_J) {
      // Alt + j
      // Click on the first "Join" button in the table list
      if (globals.currentScreen === Screen.Lobby) {
        $(".lobby-games-join-first-table-button").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_N) {
      // Alt + n
      // Click the "Create Game" button
      if (globals.currentScreen === Screen.Lobby) {
        $("#nav-buttons-lobby-create-game").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_H) {
      // Alt + h
      // Click the "Show History" button
      if (globals.currentScreen === Screen.Lobby) {
        $("#nav-buttons-lobby-history").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_A) {
      // Alt + a
      // Click on the "Watch Specific Replay" button
      // (we can't use "Alt + w" because that conflicts with LastPass)
      if (globals.currentScreen === Screen.Lobby) {
        $("#nav-buttons-lobby-replay").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_O) {
      // Alt + o
      // Click the "Sign Out" button
      if (globals.currentScreen === Screen.Lobby) {
        $("#nav-buttons-lobby-sign-out").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_S) {
      // Alt + s
      // Click on the "Start Game" button
      if (globals.currentScreen === Screen.PreGame) {
        $("#nav-buttons-pregame-start").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_C) {
      if (globals.currentScreen === Screen.PreGame) {
        $("#nav-buttons-pregame-change-options").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_L) {
      // Alt + l
      // Click on the "Leave Game" button
      if (globals.currentScreen === Screen.PreGame) {
        $("#nav-buttons-pregame-leave").click();
      }
    } else if (event.altKey && event.which === KeyCode.KEY_R) {
      // Alt + r
      clickReturnToLobby();
    } else if (event.which === KeyCode.KEY_ESCAPE) {
      // If a modal is open, pressing escape should close it
      // Otherwise, pressing escape should go "back" one screen
      clickReturnToLobby();
    }
  });
}

function clickReturnToLobby() {
  // Click on the "Return to Lobby" button
  // (either at the "game" screen or the "history" screen or the "scores" screen)
  if (globals.currentScreen === Screen.PreGame) {
    $("#nav-buttons-pregame-unattend").click();
  } else if (globals.currentScreen === Screen.History) {
    $("#nav-buttons-history-return").click();
  } else if (globals.currentScreen === Screen.HistoryOtherScores) {
    $("#nav-buttons-history-other-scores-return").click();
  }
}
