/*
    These are exported global variables to be shared between all of the TypeScript code
*/

// Imports
import version from './data/version.json';
// (the "version.json" file is filled in dynamically by the "build_client.sh" script)

interface Globals {
    version: number,
    browserIsFirefox: boolean,

    username: string | null,
    password: string | null,

    conn: any | null,

    settings: Object,

    userList: Object,
    tableList: Object,
    historyList: Object,
    historyDetailList: Array<any>,
    historyClicked: boolean,
    totalGames: number,
    randomName: string,

    game: Object,

    currentScreen: string,
    tableID: number,
    errorOccured: boolean,

    ui: Object | null,
    chatUnread: number,

    phaser: Object | null,
    init: Object | null,
    state: State,
}

interface State {
    turn: number,
    learnedCards: Array<any>,
}

const globals: Globals = {
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

    // Can be "login", "lobby", "pregame", "game", "history", and "historyDetails"
    currentScreen: 'login',
    tableID: -1, // Equal to the table we are joined to or -1 if no table
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
export default globals;

// Also make the globals available to the window
// (so that we can access them from the JavaScript console for debugging purposes)
declare global {
    interface Window { globals2: any; }
}
if (typeof window !== 'undefined') {
    window.globals2 = globals;
}
