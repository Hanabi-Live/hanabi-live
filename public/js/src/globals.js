// Configuration
const debug = true;
const fadeTime = 350;

// Exported global variables
const globals = {
    debug,
    fadeTime,
    browserIsFirefox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,

    username: null,
    password: null,

    conn: null, // The websocket connection (set in "websocket.js")

    userList: {}, // Set upon login
    tableList: {}, // Set upon login
    historyList: {}, // Set upon login
    historyDetailList: [], // Set upon clicking the "History Details" button
    historyClicked: false,
    // Used to keep track of whether the user clicked on the "Show More History" button
    totalGames: 0, // Set upon login
    randomName: '', // Set upon login

    // The lobby settings found in the gear sub-menu
    settings: {
        sendTurnNotify: false,
        sendTurnSound: true, // We want sounds by default
        sendTimerSound: true, // We want sounds by default
        sendChatNotify: false,
        sendChatSound: false,
        showBGAUI: false,
        showColorblindUI: false,
        showTimerInUntimed: false,
        reverseHands: false,
        speedrunPreplay: false,
        speedrunHotkeys: false,
    },

    gameID: null,
    game: {}, // Equal to the data for the "game" command
    init: {}, // Equal to the data for the "init" command
    state: { // Variables that represent the current game state
        activeIndex: 0,
        deck: [],
    },

    currentScreen: 'login',
    errorOccured: false,

    /*
    app: null, // This is the canvas container initialized in "game/init.js"
    resources: null, // This contains the loaded graphics, initialized in "game/init.js"
    ui: null, // This contains UI variables and objects, initialized in "game/init.js"
    */
    ui: null, // This contains the HanabiUI object (legacy)
};
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals = globals;
