// This is the main entry point for the client code. The client code is split up into multiple files
// and then bundled together as a single JavaScript file to serve to end-users.

import { DOMAIN, OLD_DOMAIN } from "@hanabi-live/data";
import jquery from "jquery";
import { globals } from "./Globals";
import { Loader } from "./Loader";
import * as chat from "./chat";
import { NO_TABLE_ID } from "./constants";
import { initErrorListener } from "./errors";
import * as gameChat from "./game/chat";
import * as game from "./game/main";
import { backToLobby } from "./game/ui/backToLobby";
import * as lobbyCreateGame from "./lobby/createGame";
import * as lobbyHistory from "./lobby/history";
import { lobbyIdleInit } from "./lobby/lobbyIdleInit";
import { lobbyKeyboardInit } from "./lobby/lobbyKeyboardInit";
import { lobbyTutorialInit } from "./lobby/lobbyTutorialInit";
import * as lobbyLogin from "./lobby/login";
import * as lobbyNav from "./lobby/nav";
import * as playerSettings from "./lobby/playerSettings";
import * as lobbyPregame from "./lobby/pregame";
import { Screen } from "./lobby/types/Screen";
import { mountUsersList } from "./lobby/users/mountUsersList";
import * as lobbyWatchReplay from "./lobby/watchReplay";
import * as modals from "./modals";
import * as sounds from "./sounds";
import * as theme from "./theme";
import * as tooltips from "./tooltips";
import { setBrowserAddressBarPath } from "./utils";

// Initialize jQuery:
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    $: JQueryStatic;
  }
}
window.$ = jquery; // eslint-disable-line unicorn/prefer-global-this

// Manually redirect users that are going to wrong URLs.
if (
  globalThis.location.hostname === OLD_DOMAIN
  || globalThis.location.hostname === `www.${OLD_DOMAIN}`
  || globalThis.location.hostname === `www.${DOMAIN}`
) {
  globalThis.location.replace(
    `https://${DOMAIN}${globalThis.location.pathname}`,
  );
}

initErrorListener();

$(document).ready(() => {
  globalThis.addEventListener("popstate", () => {
    if (globalThis.location.pathname !== "/lobby") {
      globalThis.location.reload();
      return;
    }

    const { hash } = globalThis.location;
    if (globals.currentScreen === Screen.Game) {
      backToLobby();
      setBrowserAddressBarPath("/lobby", hash);
    } else if (globals.currentScreen === Screen.PreGame) {
      lobbyPregame.hide(false);
      globals.conn!.send("tableUnattend", { tableID: globals.tableID });
      globals.tableID = NO_TABLE_ID;
    }

    if (hash.startsWith("#history")) {
      lobbyHistory.show();
      if (hash.startsWith("#history-other-scores-")) {
        const match = /^#history-other-scores-(.+)$/u.exec(hash);
        if (match !== null && match[1] !== undefined) {
          lobbyHistory.showOtherScoresFromURL(decodeURIComponent(match[1]));
        }
      }
    } else if (
      globals.currentScreen === Screen.History
      || globals.currentScreen === Screen.HistoryOtherScores
    ) {
      lobbyHistory.hide();
    }
  });

  // Set an event handler for when the entire window loses focus.
  $(globalThis).blur(() => {
    if (globals.currentScreen === Screen.Game && globals.ui !== null) {
      globals.ui.focusLost();
    }
  });

  // Now that the page has loaded, initialize and define the functionality of various UI elements.
  modals.init();
  chat.init();
  game.init();
  gameChat.init();
  tooltips.initGame();
  lobbyCreateGame.init();
  lobbyHistory.init();
  lobbyIdleInit();
  lobbyKeyboardInit();
  lobbyLogin.init();
  lobbyNav.init();
  mountUsersList();
  playerSettings.init();
  theme.init();
  lobbyTutorialInit();
  lobbyWatchReplay.init();
  sounds.init();

  // Start preloading some images that we will need for when a game starts.
  globals.imageLoader = new Loader();

  // For debugging graphics.
  /*
  $('body').click((event) => {
    console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
  });
  */

  // Now that the UI is initialized, automatically login if the user has cached credentials.
  lobbyLogin.automaticLogin();
});
