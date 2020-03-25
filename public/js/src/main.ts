/*
    The main entry point for the Hanabi client code
*/

// The client code is split up into multiple files and bundled together with Webpack
import * as chat from './chat';
import * as gameMain from './game/main';
import * as gameChat from './game/chat';
import * as gameSounds from './game/sounds';
import gameTooltipsInit from './game/tooltipsInit';
import * as lobbyCreateGame from './lobby/createGame';
import * as lobbyHistory from './lobby/history';
import * as lobbyLogin from './lobby/login';
import lobbyKeyboardInit from './lobby/keyboardInit';
import lobbyNavInit from './lobby/navInit';
import * as lobbySettings from './lobby/settings';
import lobbyTutorialInit from './lobby/tutorialInit';
import * as lobbyWatchReplay from './lobby/watchReplay';
import * as modals from './modals';

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

// Add a function to the jQuery object to detect if an element is off screen
// From: https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen
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
    gameMain.init();
    gameChat.init();
    gameSounds.init();
    gameTooltipsInit();
    lobbyCreateGame.init();
    lobbyHistory.init();
    lobbyLogin.init();
    lobbyKeyboardInit();
    lobbyNavInit();
    lobbySettings.init();
    lobbyTutorialInit();
    lobbyWatchReplay.init();
    modals.init();

    // For debugging graphics
    /*
    $('body').click((event) => {
        console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
    });
    */

    // Now that the UI is initialized, automatically login if the user has cached credentials
    lobbyLogin.automaticLogin();
});
