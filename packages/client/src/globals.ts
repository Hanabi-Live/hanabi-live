// These are exported global variables to be shared between all of the TypeScript code.

import { VERSION } from "@hanabi/data";
import { Connection } from "./Connection";
import { Loader } from "./Loader";
import { HanabiUI } from "./game/ui/HanabiUI";
import { Game } from "./lobby/types/Game";
import { GameHistory } from "./lobby/types/GameHistory";
import { Screen } from "./lobby/types/Screen";
import { Settings } from "./lobby/types/Settings";
import { Table } from "./lobby/types/Table";
import { User } from "./lobby/types/User";

export class Globals {
  // The version file is filled in dynamically by the build scripts.
  version = VERSION;

  conn: Connection | null = null; // The WebSocket connection (set in "websocket.ts")

  // Values sent to us from the server in the "welcome" message.
  userID = -1;
  username = "";
  totalGames = 0;
  muted = false;
  randomTableName = "";
  /** Contains the settings for the "Settings" tooltip and the "Create Game" tooltip. */
  settings: Settings = new Settings();
  friends: string[] = [];
  shuttingDown = false;
  datetimeShutdownInit = new Date();
  maintenanceMode = false;

  /** Keys are IDs. */
  userMap = new Map<number, User>();
  /** Keys are IDs. */
  tableMap = new Map<number, Table>();
  history: GameHistory[] = [];
  historyFriends: GameHistory[] = [];
  totalGamesFriends = 0;

  peopleTyping: string[] = [];

  showMoreHistoryClicked = false;
  idleMinutes = 0;

  // If the start game button is disabled due to a player leaving or joining, stores the ID of a
  // timeout designed to re-enable it.
  enableStartGameButtonTimeout: NodeJS.Timeout | null = null;

  game: Game | null = null; // Equal to the data from the "game" command

  currentScreen: Screen = Screen.Login;
  tableID = -1; // Equal to the table we are joined to or -1 if no table
  errorOccurred = false;

  // UI variables
  imageLoader: Loader | null = null;
  ui: HanabiUI | null = null;
  // Used to keep track of how many in-game chat messages are currently unread.
  chatUnread = 0;
  zenModeEnabled = false;
  // Used to keep track of the active element before model warning box.
  lastActiveElement: HTMLElement | null = null;

  browserIsFirefox =
    // `navigator` is undefined in Jest tests.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    navigator === undefined
      ? false
      : navigator.userAgent.toLowerCase().includes("firefox");
}

export const globals = new Globals();

// Also make the globals available to the window (so that we can access them from the JavaScript
// console for debugging purposes).
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    globals2: Globals;
  }
}
// `window` is undefined in Jest tests.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (window !== undefined) {
  // We set the UI globals to `globals`, so these globals can take `globals2`.
  window.globals2 = globals;
}
