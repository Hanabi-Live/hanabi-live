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

import * as Sentry from '@sentry/browser';
import * as chat from './chat';
import version from './data/version.json';
import * as gameChat from './game/chat';
import * as gameMain from './game/main';
import gameTooltipsInit from './game/tooltipsInit';
import * as lobbyCreateGame from './lobby/createGame';
import * as lobbyHistory from './lobby/history';
import lobbyIdleInit from './lobby/idleInit';
import lobbyKeyboardInit from './lobby/keyboardInit';
import * as lobbyLogin from './lobby/login';
import lobbyNavInit from './lobby/navInit';
import * as lobbySettingsTooltip from './lobby/settingsTooltip';
import lobbyTutorialInit from './lobby/tutorialInit';
import * as lobbyWatchReplay from './lobby/watchReplay';
import * as modals from './modals';
import * as sounds from './sounds';

// Initialize Sentry logging
if (window.location.hostname !== 'localhost' && !window.location.pathname.includes('/dev')) {
  Sentry.init({
    dsn: 'https://93293e0a9dff44c7b8485d646738a3e5@sentry.io/5189482',
    release: version.toString(),
    debug: true,
    beforeSend: (
      event: Sentry.Event,
      hint?: Sentry.EventHint | undefined,
    ): Sentry.Event | PromiseLike<Sentry.Event | null> => {
      if (typeof hint === 'undefined') {
        return event;
      }

      // We do not want to not send certain specific common events to Sentry
      // (to avoid using up our monthly limit)
      const error = hint.originalException;
      if (error && (error as Error).message) {
        const msg = (error as Error).message;
        if (
          // All of these are related to playing a sound file before the user has interacted with
          // the page
          msg.match(/The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission./)
          || msg.match(/The play method is not allowed by the user agent or the platform in the current context, possibly because the user denied permission./)
          || msg.match(/play\(\) can only be initiated by a user gesture./)
          || msg.match(/play\(\) failed because the user didn't interact with the document first./)
          || msg.match(/The fetching process for the media resource was aborted by the user agent at the user's request./)
          || msg.match(/Failed to load because no supported source was found./)
          || msg.match(/AbortError: The operation was aborted./)

          // Has to do with LastPass
          || msg.match(/a.LegacyGlobal.LP_explicit_ignored is not a function./)
        ) {
          return (null as any);
        }
      }
      return event;
    },
  });
}

// Add a function to the jQuery object to detect if an element is off screen
// https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen
($.expr as any).filters.offscreen = (el: any) => {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < 0 // Above the top
        || rect.bottom > window.innerHeight // Below the bottom
        || rect.left < 0 // Left of the left edge
        || rect.right > window.innerWidth // Right of the right edge
  );
};

// Manually redirect users that go to "www.hanabi.live" instead of "hanabi.live"
if (window.location.hostname === 'www.hanabi.live') {
  window.location.replace('https://hanabi.live');
}

$(document).ready(() => {
  // Now that the page has loaded, initialize and define the functionality of various UI elements
  // (mostly using jQuery selectors)
  chat.init();
  gameChat.init();
  gameMain.init();
  gameTooltipsInit();
  lobbyCreateGame.init();
  lobbyHistory.init();
  lobbyIdleInit();
  lobbyKeyboardInit();
  lobbyLogin.init();
  lobbyNavInit();
  lobbySettingsTooltip.init();
  lobbyTutorialInit();
  lobbyWatchReplay.init();
  modals.init();
  sounds.init();

  // For debugging graphics
  // eslint-disable-next-line multiline-comment-style
  /*
  $('body').click((event) => {
    console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
  });
  */

  // Now that the UI is initialized, automatically login if the user has cached credentials
  lobbyLogin.automaticLogin();
});
