// The Hanabi game UI.

import { FADE_TIME_MS, HISTORY_HASH, PATH } from "../constants.ts";
import { globals } from "../Globals.ts";
import { scrollLobbyChatToBottom } from "../lobby/chat/LobbyChat.tsx";
import * as lobbyPage from "../lobby/lobbyPage.ts";
import { Screen } from "../lobby/types/Screen.ts";
import * as sounds from "../sounds.ts";
import * as tooltips from "../tooltips.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import * as chat from "./chat.ts";
import * as newUI from "./newUI/newUI.tsx";
import { HanabiUI } from "./ui/HanabiUI.ts";

/** The history screen's address (e.g. "#history"), if a replay was opened from one. */
let historyHash = "";

export function init(): void {
  $("#game").on("mouseenter mouseleave", () => {
    if (globals.currentScreen === Screen.Game && globals.ui !== undefined) {
      globals.ui.focusLost();
    }
  });
}

export function show(justStarted: boolean): void {
  const { pathname, hash } = globalThis.location;
  historyHash =
    pathname === PATH.LOBBY && hash.startsWith(HISTORY_HASH) ? hash : "";

  tooltips.clearPlayerTimeTooltips();
  lobbyPage.hide();
  globals.currentScreen = Screen.Game;
  document.body.dataset["screen"] = "game";
  $("#page-wrapper").hide(); // We can't fade this out as it will overlap
  $("#game-chat-text").html(""); // Clear the in-game chat box of any previous content
  // eslint-disable-next-line @typescript-eslint/strict-void-return
  $("body").on("contextmenu", () => false); // Disable the right-click context menu
  // The classic screen keeps running underneath the redesigned one, hidden.
  if (!globals.settings.newUi) {
    $("#game").fadeIn(FADE_TIME_MS);
  }

  // Every time a new game is opened, the UI is rebuilt from scratch.
  globals.ui = new HanabiUI(globals, gameExports, justStarted);
  globals.chatUnread = 0;
  if (globals.settings.newUi) {
    newUI.mount();
  }

  // Request some high-level information about the game (e.g. the number of players and the variant)
  // The server will send us back an "init" message, which will contain enough information to start
  // drawing the UI (we will request the specific actions for the game later on)
  globals.conn!.send("gameInitLoad", {
    tableId: globals.tableId,
  });
}

/** Shows the redesigned game screen in place of the classic one, for the rest of this game. */
function showNewUI() {
  // The new screen has its own chat panel, which takes the chat box from the classic chat window.
  $("#game-chat-modal").hide();
  $("#game").hide();
  newUI.mount();
}

function hide() {
  // Account that we could be going back to one of the history screens. (We could have entered a
  // solo replay from one of the history screens.) They are still shown inside the hidden page.
  if (isDisplayed("#lobby-history")) {
    globals.currentScreen = Screen.History;
  } else if (isDisplayed("#lobby-history-other-scores")) {
    globals.currentScreen = Screen.HistoryOtherScores;
  } else {
    globals.currentScreen = Screen.Lobby;
  }
  if (
    globals.currentScreen !== Screen.Lobby
    && historyHash !== ""
    && globalThis.location.pathname === PATH.LOBBY
  ) {
    setBrowserAddressBarPath(PATH.LOBBY, historyHash);
  }
  document.body.dataset["screen"] = "lobby";

  newUI.unmount();
  if (globals.ui !== undefined) {
    globals.ui.destroy();
    globals.ui = undefined;
  }

  $("#game").hide(); // We can't fade this out as it will overlap
  $("body").off("contextmenu"); // Enable the right-click context menu
  $("#page-wrapper").fadeIn(FADE_TIME_MS);

  // Make sure that there are not any game-related modals showing.
  $("#game-chat-modal").hide();

  // Make sure that there are not any game-related tooltips showing.
  tooltips.closeAllTooltips();

  // Scroll to the bottom of the chat.
  scrollLobbyChatToBottom();
}

/** Whether an element is displayed, even if a hidden ancestor keeps it from being visible. */
function isDisplayed(selector: string) {
  return $(selector).css("display") !== "none";
}

// These are references to some functions and submodules that need to be interacted with in the UI
// code (e.g. hiding the UI, playing a sound).
export interface GameExports {
  hide: () => void;
  showNewUI: () => void;
  chat: typeof chat;
  sounds: typeof sounds;
}
const gameExports: GameExports = {
  hide,
  showNewUI,
  chat,
  sounds,
};
