// Configuration
const fadeTime = 350;
// The "version.js" file is filled in dynamically by the "build_client.sh" script
const version = require('./version'); // eslint-disable-line import/no-unresolved

// Exported global variables
const globals = {
    fadeTime,
    version,
    browserIsFirefox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,

    username: null,
    password: null,

    conn: null, // The websocket connection (set in "websocket.js")

    // Contains the settings for the "Settings" tooltip and the "Create Game" tooltip
    settings: {}, // Set upon login

    userList: {}, // Set upon login
    tableList: {}, // Set upon login
    historyList: {}, // Set upon login
    historyDetailList: [], // Set upon clicking the "History Details" button
    historyClicked: false,
    // Used to keep track of whether the user clicked on the "Show More History" button
    totalGames: 0, // Set upon login
    randomName: '', // Set upon login

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
window.globals2 = globals;
