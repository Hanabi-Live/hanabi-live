/*
    These are exported global variables to be shared between all of the TypeScript code
*/

// Imports
import version from './data/version.json';
import Game from './lobby/Game';
import GameHistory from './lobby/GameHistory';
import Settings from './lobby/Settings';
import Table from './lobby/Table';
import User from './lobby/User';

// (the "version.json" file is filled in dynamically by the "build_client.sh" script)

type screen = 'login' | 'lobby' | 'pregame' | 'game' | 'history' | 'historyOtherScores';

export class Globals {
    version: number = version;
    browserIsFirefox: boolean = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    username: string = '';
    password: string = '';

    conn: any = null; // The WebSocket connection (set in "websocket.ts")

    // Values sent to us from the server in the "hello" message
    id: number = -1;
    totalGames: number = 0;
    muted: boolean = false;
    admin: boolean = false;
    randomName: string = '';
    settings: Settings = new Settings();
    // (contains the settings for the "Settings" tooltip and the "Create Game" tooltip)
    shuttingDown: boolean = false;

    userMap: Map<number, User> = new Map(); // Keys are IDs
    tableMap: Map<number, Table> = new Map(); // Keys are IDs
    history: Array<GameHistory> = [];
    showMoreHistoryClicked: boolean = false;
    lastPM: string = '';
    datetimeLastChatInput: number = new Date().getTime();
    peopleTyping: Array<string> = [];
    idleMinutes: number = 0;

    game: Game | null = null; // Equal to the data from the "game" command

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
