// This is the main entry point for the client code. The client code is split up into multiple files
// and then bundled together as a single JavaScript file to serve to end-users.

import { DOMAIN, OLD_DOMAIN } from "@hanabi-live/data";
import { mountApp } from "./App.tsx";
import { globals } from "./Globals.ts";
import { Loader } from "./Loader.ts";
import * as chat from "./chat.ts";
import { HISTORY_HASH, PATH } from "./constants.ts";
import { initErrorListener } from "./errors.ts";
import * as gameChat from "./game/chat.ts";
import * as game from "./game/main.ts";
import { backToLobby } from "./game/ui/backToLobby.ts";
import * as lobbyHistory from "./lobby/history.ts";
import { getOtherScoresSeed } from "./lobby/historyHash.ts";
import { lobbyIdleInit } from "./lobby/lobbyIdleInit.ts";
import { lobbyKeyboardInit } from "./lobby/lobbyKeyboardInit.ts";
import * as lobbyLogin from "./lobby/login.ts";
import * as lobbyPregame from "./lobby/pregame/pregame.ts";
import { Screen } from "./lobby/types/Screen.ts";
import * as modals from "./modals.ts";
import * as sounds from "./sounds.ts";
import { store } from "./store.ts";
import * as tooltips from "./tooltips.ts";
import { setBrowserAddressBarPath } from "./utils.ts";

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

/** Starts the client once the page has loaded. */
function init() {
  globalThis.addEventListener("popstate", () => {
    if (globalThis.location.pathname !== PATH.LOBBY) {
      globalThis.location.reload();
      return;
    }

    const { hash } = globalThis.location;
    if (store.getState().session.screen === Screen.Game) {
      backToLobby();
      setBrowserAddressBarPath(PATH.LOBBY, hash);
    } else if (store.getState().session.screen === Screen.PreGame) {
      lobbyPregame.hide(false);
      globals.connection.send("tableUnattend", {
        tableId: globals.joinedTableId,
      });
      globals.tableId = undefined;
    }

    if (hash.startsWith(HISTORY_HASH)) {
      lobbyHistory.show();
      const seed = getOtherScoresSeed(hash);
      if (seed !== undefined) {
        lobbyHistory.showOtherScores(seed);
      }
    } else if (
      store.getState().session.screen === Screen.History
      || store.getState().session.screen === Screen.HistoryOtherScores
    ) {
      lobbyHistory.hide();
    }
  });

  // Set an event handler for when the entire window loses focus.
  globalThis.addEventListener("blur", () => {
    if (
      store.getState().session.screen === Screen.Game
      && globals.ui !== undefined
    ) {
      globals.ui.focusLost();
    }
  });

  // Now that the page has loaded, initialize and define the functionality of various UI elements.
  modals.init();
  mountApp();
  chat.init();
  game.init();
  gameChat.init();
  tooltips.initGame();
  lobbyIdleInit();
  lobbyKeyboardInit();
  sounds.init();

  // Start preloading some images that we will need for when a game starts.
  globals.imageLoader = new Loader();

  // Now that the UI is initialized, automatically login if the user has cached credentials.
  lobbyLogin.automaticLogin();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
