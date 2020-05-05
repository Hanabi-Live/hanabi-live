// This is the main entry point for the Hanabi client code
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
import * as gameMain from './game/main';
import gameTooltipsInit from './game/tooltipsInit';
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
  gameTooltipsInit();
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

  // For debugging graphics
  /*
  $('body').click((event) => {
    console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
  });
  */

  // Now that the UI is initialized, automatically login if the user has cached credentials
  lobbyLogin.automaticLogin();
});
