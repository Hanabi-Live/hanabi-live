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

import 'tooltipster';
import '../lib/tooltipster-scrollableTip.min';

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
