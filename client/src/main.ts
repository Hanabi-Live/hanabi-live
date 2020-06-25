// This is the main entry point for the Hanabi client code
// The client code is split up into multiple files and bundled together with Webpack

import * as chat from './chat';
import * as gameChat from './game/chat';
import * as gameMain from './game/main';
// import gameTooltipsInit from './game/tooltipsInit';
import globals from './globals';
import Loader from './Loader';
import * as lobbyHistory from './lobby/history';
import lobbyIdleInit from './lobby/idleInit';
import lobbyKeyboardInit from './lobby/keyboardInit';
import * as lobbyLogin from './lobby/login';
import * as lobbyNav from './lobby/nav';
import * as lobbySettingsTooltip from './lobby/settingsTooltip';
import lobbyTutorialInit from './lobby/tutorialInit';
import * as lobbyWatchReplay from './lobby/watchReplay';
import * as misc from './misc';
import * as modals from './modals';
import * as sentry from './sentry';
import * as sounds from './sounds';

// Initialize logging to Sentry.io
sentry.init();

// Manually redirect users that go to "www.hanabi.live" instead of "hanabi.live"
if (window.location.hostname === 'www.hanabi.live') {
  window.location.replace('https://hanabi.live');
}

$(document).ready(() => {
  // Now that the page has loaded, initialize and define the functionality of various UI elements
  chat.init();
  gameChat.init();
  gameMain.init();
  // gameTooltipsInit();
  lobbyHistory.init();
  lobbyIdleInit();
  lobbyKeyboardInit();
  lobbyLogin.init();
  lobbyNav.init();
  lobbySettingsTooltip.init();
  lobbyTutorialInit();
  lobbyWatchReplay.init();
  misc.init();
  modals.init();
  sounds.init();

  // Start preloading some images that we will need for when a game starts
  globals.imageLoader = new Loader();

  // For debugging graphics
  /*
  $('body').click((event) => {
    console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
  });
  */

  // Now that the UI is initialized, automatically login if the user has cached credentials
  lobbyLogin.automaticLogin();
});
