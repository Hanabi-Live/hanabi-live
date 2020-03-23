/*
    These are exported global variables to be shared between all of the TypeScript code
*/

// Imports
import GameHistory from './lobby/GameHistory';
import version from './data/version.json';
// (the "version.json" file is filled in dynamically by the "build_client.sh" script)

type screen = 'login' | 'lobby' | 'pregame' | 'game' | 'history' | 'historyOtherScores';

class Globals {
    version: number = version;
    browserIsFirefox: boolean = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    username: string = '';
    password: string = '';

    conn: any = null; // The WebSocket connection (set in "websocket.ts")
    // (this must be an "any" type because we attach arbitrary methods to the object)

    // Contains the settings for the "Settings" tooltip and the "Create Game" tooltip
    settings: Map<string, boolean | number | string> = new Map(); // Set upon login

    userList: Map<number, User> = new Map(); // Keys are IDs
    tableList: Map<number, Table> = new Map(); // Keys are IDs
    history: Array<GameHistory> = [];
    showMoreHistoryClicked: boolean = false;
    totalGames: number = 0; // Set upon login
    randomName: string = ''; // Set upon login

    game: any = {}; // Equal to the data from the "game" command // TODO convert to a Game object

    currentScreen: screen = 'login'; // See "screen" declaration above
    tableID: number = -1; // Equal to the table we are joined to or -1 if no table
    errorOccured: boolean = false;

    // Legacy UI variables
    // TODO convert to a HanabiUI object
    ui: any | null = null; // This contains the HanabiUI object (legacy)
    // Used to keep track of how many in-game chat messages are currently unread
    chatUnread: number = 0;

    // Phaser UI variables
    phaser: any | null = null; // TODO convert to a PhaserUI object
    // TODO convert to an Init object
    init: any | null = null; // Equal to the data from the "init" command
    // ui: null, // The various graphics objects used, initialized in the "commands.init()" function
    state: State = { // Variables relating to the current game state
        turn: 0,
        learnedCards: [],
    };
}

// TODO replace with State from State.ts
interface State {
    turn: number,
    learnedCards: Array<any>,
}

const globals = new Globals();
export default globals;

// Also make the globals available to the window
// (so that we can access them from the JavaScript console for debugging purposes)
declare global {
    interface Window {
        globals2: Globals;
    }
}
if (typeof window !== 'undefined') {
    window.globals2 = globals;
}
