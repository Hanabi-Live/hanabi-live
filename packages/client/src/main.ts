// This is the main entry point for the client code. The client code is split up into multiple files
// and then bundled together as a single JavaScript file to serve to end-users.

import { DOMAIN, OLD_DOMAIN } from "@hanabi/data";
import jquery from "jquery";
import { globals } from "./Globals";
import { Loader } from "./Loader";
import * as chat from "./chat";
import { initErrorListener } from "./errors";
import * as gameChat from "./game/chat";
import * as game from "./game/main";
import * as lobbyCreateGame from "./lobby/createGame";
import * as lobbyHistory from "./lobby/history";
import { lobbyIdleInit } from "./lobby/lobbyIdleInit";
import { lobbyKeyboardInit } from "./lobby/lobbyKeyboardInit";
import { lobbyTutorialInit } from "./lobby/lobbyTutorialInit";
import * as lobbyLogin from "./lobby/login";
import * as lobbyNav from "./lobby/nav";
import * as playerSettings from "./lobby/playerSettings";
import { Screen } from "./lobby/types/Screen";
import * as lobbyWatchReplay from "./lobby/watchReplay";
import * as modals from "./modals";
import * as sounds from "./sounds";
import * as tooltips from "./tooltips";

// Initialize JQuery:
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    $: JQueryStatic;
  }
}
window.$ = jquery;

// Manually redirect users that are going to wrong URLs.
if (
  window.location.hostname === OLD_DOMAIN ||
  window.location.hostname === `www.${OLD_DOMAIN}` ||
  window.location.hostname === `www.${DOMAIN}`
) {
  window.location.replace(`https://${DOMAIN}${window.location.pathname}`);
}

initErrorListener();

$(document).ready(() => {
  // Set an event handler for when the entire window loses focus.
  $(window).blur(() => {
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
  playerSettings.init();
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
