const fadeTime = 350;

const globals = {
    debug: true,
    fadeTime,

    userList: {}, // Set upon login`
    tableList: {}, // Set upon login
    historyList: {}, // Set upon login
    historyDetailList: [], // Set upon clicking the "History Details" button

    // Upon connecting, the server will only send us the last 10 games that we played
    // If the user clicks on the "Show More History" button,
    // then the server will send all of their games, and this will get set to true
    historyAll: false,

    username: null,
    password: null,

    // The lobby settings found in the gear sub-menu
    settings: {
        sendTurnNotify: false,
        sendTurnSound: true, // We want sounds by default
        sendTimerSound: true,
        sendChatNotify: false,
        sendChatSound: false,
        showColorblindUI: false,
        hideTimerInUntimed: true,
    },

    randomName: '', // Set upon login

    gameID: null,
    game: {}, // Equal to the data for the "game" command
    init: {}, // Equal to the data for the "init" command
    /*
        e.g.
        {
           names: [
              "test",
              "test2"
           ],
           replay: true,
           seat: 0,
           spectating: false,
           timed: false,
           reorderCards: false,
           variant: 0,
           sharedReplay: false
        }
    */
    state: { // Variables that represent the current game state
        activeIndex: 0,
        deck: [],
    },

    currentScreen: 'login',
    errorOccured: false,

    app: null, // This is the canvas container initialized in "game/init.js"
    resources: null, // This contains the loaded graphics, initialized in "game/init.js"
    ui: null, // This contains UI variables and object, initialized in "game/init.js"

};
module.exports = globals;

// Also make it available to the window so that we can access global variables from the JavaScript console
// (for debugging purposes)
window.globals = globals;
