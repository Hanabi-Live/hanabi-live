// This is the main entry point for the client code. The client code is split up into multiple files
// and then bundled together as a single JavaScript file to serve to end-users.

import { DOMAIN, OLD_DOMAIN } from "@hanabi-live/data";
import jquery from "jquery";
import { globals } from "./Globals.ts";
import { Loader } from "./Loader.ts";
import * as chat from "./chat.ts";
import { HISTORY_HASH, NO_TABLE_ID, PATH } from "./constants.ts";
import { initErrorListener } from "./errors.ts";
import * as gameChat from "./game/chat.ts";
import * as game from "./game/main.ts";
import { backToLobby } from "./game/ui/backToLobby.ts";
import { mountLobbyChat } from "./lobby/chat/mountLobbyChat.tsx";
import * as lobbyCreateGame from "./lobby/createGame.ts";
import { mountHistoryLists } from "./lobby/gameHistory/mountHistoryLists.tsx";
import * as lobbyHistory from "./lobby/history.ts";
import { getOtherScoresSeed } from "./lobby/historyHash.ts";
import { lobbyIdleInit } from "./lobby/lobbyIdleInit.ts";
import { lobbyKeyboardInit } from "./lobby/lobbyKeyboardInit.ts";
import * as lobbyLayout from "./lobby/lobbyLayout.ts";
import { lobbyTutorialInit } from "./lobby/lobbyTutorialInit.ts";
import * as lobbyLogin from "./lobby/login.ts";
import { mountNav } from "./lobby/nav/mountNav.tsx";
import { mountPregame } from "./lobby/pregame/mountPregame.tsx";
import * as lobbyPregame from "./lobby/pregame/pregame.ts";
import { mountSettings } from "./lobby/settings/mountSettings.tsx";
import { mountTablesList } from "./lobby/tables/mountTablesList.tsx";
import { Screen } from "./lobby/types/Screen.ts";
import { mountUsersList } from "./lobby/users/mountUsersList.tsx";
import { mountWatchReplay } from "./lobby/watchReplay/mountWatchReplay.tsx";
import * as modals from "./modals.ts";
import * as sounds from "./sounds.ts";
import * as tooltips from "./tooltips.ts";
import { setBrowserAddressBarPath } from "./utils.ts";

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
    if (globalThis.location.pathname !== PATH.LOBBY) {
      globalThis.location.reload();
      return;
    }

    const { hash } = globalThis.location;
    if (globals.currentScreen === Screen.Game) {
      backToLobby();
      setBrowserAddressBarPath(PATH.LOBBY, hash);
    } else if (globals.currentScreen === Screen.PreGame) {
      lobbyPregame.hide(false);
      globals.conn!.send("tableUnattend", { tableId: globals.tableId });
      globals.tableId = NO_TABLE_ID;
    }

    if (hash.startsWith(HISTORY_HASH)) {
      lobbyHistory.show();
      const seed = getOtherScoresSeed(hash);
      if (seed !== undefined) {
        lobbyHistory.showOtherScores(seed);
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
    if (globals.currentScreen === Screen.Game && globals.ui !== undefined) {
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
  lobbyIdleInit();
  lobbyKeyboardInit();
  lobbyLogin.init();
  lobbyLayout.init();
  mountHistoryLists();
  mountLobbyChat();
  mountNav();
  mountPregame();
  mountSettings();
  mountTablesList();
  mountUsersList();
  mountWatchReplay();
  lobbyTutorialInit();
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
