// These are exported global variables to be shared between all of the TypeScript code

import version from '../../data/version.json';
import Connection from './Connection';
import HanabiUI from './game/ui/HanabiUI';
import Loader from './Loader';
import Game from './lobby/types/Game';
import GameHistory from './lobby/types/GameHistory';
import Screen from './lobby/types/Screen';
import Settings from './lobby/types/Settings';
import Table from './lobby/types/Table';
import User from './lobby/types/User';

export class Globals {
  // The "version.json" file is filled in dynamically by the "build_client.sh" script
  version: number = version;

  conn: Connection | null = null; // The WebSocket connection (set in "websocket.ts")

  // Values sent to us from the server in the "welcome" message
  userID: number = -1;
  username: string = '';
  totalGames: number = 0;
  muted: boolean = false;
  randomName: string = '';
  settings: Settings = new Settings();
  // (contains the settings for the "Settings" tooltip and the "Create Game" tooltip)
  friends: string[] = [];
  shuttingDown: boolean = false;
  datetimeShutdownInit: number = 0;
  maintenanceMode: boolean = false;

  userMap: Map<number, User> = new Map<number, User>(); // Keys are IDs
  tableMap: Map<number, Table> = new Map<number, Table>(); // Keys are IDs
  history: GameHistory[] = [];
  historyFriends: GameHistory[] = [];
  totalGamesFriends: number = 0;

  peopleTyping: string[] = [];

  showMoreHistoryClicked: boolean = false;
  idleMinutes: number = 0;

  game: Game | null = null; // Equal to the data from the "game" command

  currentScreen: Screen = Screen.Login;
  modalShowing: boolean = false;
  tableID: number = -1; // Equal to the table we are joined to or -1 if no table
  errorOccurred: boolean = false;

  // UI variables
  imageLoader: Loader | null = null;
  ui: HanabiUI | null = null;
  // Used to keep track of how many in-game chat messages are currently unread
  chatUnread: number = 0;

  browserIsFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
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
if (window !== undefined) {
  window.globals2 = globals;
}
