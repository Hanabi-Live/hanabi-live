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
    },

    game: {}, // Equal to the data from the "game" command

    currentScreen: 'login',
    errorOccured: false,

    // Legacy UI variables
    ui: null, // This contains the HanabiUI object (legacy)
    chatUnread: 0, // Used to keep track of how many in-game chat messages are currently unread

    // Phaser UI variables
    phaser: null,
    init: null, // Equal to the data from the "init" command
    // ui: null, // The various graphics objects used, initialized in the "commands.init()" function
    state: { // Variables relating to the current game state
        turn: 0,
        learnedCards: [],
    },
};
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals = globals;
