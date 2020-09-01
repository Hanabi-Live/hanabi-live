// This is the main entry point for the client code
// The client code is split up into multiple files and bundled together with Webpack

// Tooltipster is a jQuery library, so we import it purely for the side-effects
// (e.g. so that it can add the ".tooltipster" property to the "$" object)
// Webpack will purge modules like this from the resulting bundled file (e.g. the "tree shaking"
// feature) if we have "sideEffects" equal to true in the "package.json" file
// So we have to make sure that "sideEffects" is is either removed or set to false
// Tree shaking only makes a difference of 2 KB in the resulting bundled file, so we do not have
// to worry about that for now
import 'tooltipster';

// ScrollableTip is a Tooltipster library that allows for a scrolling tooltip
// We import it for the side-effects for the same reason
import '../lib/tooltipster-scrollableTip.min';

import * as chat from './chat';
import * as gameChat from './game/chat';
import * as game from './game/main';
import globals from './globals';
import Loader from './Loader';
import * as lobbyCreateGame from './lobby/createGame';
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
import * as tooltips from './tooltips';

// Initialize logging to Sentry.io
sentry.init();

if (
  // Manually redirect users that go to the old domain
  window.location.hostname === 'hanabi.live'
  || window.location.hostname === 'www.hanabi.live'
  // Manually redirect users that go to "www.hanab.live" instead of "hanab.live"
  || window.location.hostname === 'www.hanab.live'
) {
  window.location.replace(`https://hanab.live${window.location.pathname}`);
}

$(document).ready(() => {
  // Now that the page has loaded, initialize and define the functionality of various UI elements
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
