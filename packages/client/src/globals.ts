// These are exported global variables to be shared between all of the TypeScript code.

import { VERSION } from "@hanabi/data";
import type { Connection } from "./Connection";
import type { Loader } from "./Loader";
import type { HanabiUI } from "./game/ui/HanabiUI";
import type { Game } from "./lobby/types/Game";
import type { GameHistory } from "./lobby/types/GameHistory";
import { Screen } from "./lobby/types/Screen";
import { Settings } from "./lobby/types/Settings";
import type { Table } from "./lobby/types/Table";
import type { User } from "./lobby/types/User";

export class Globals {
  /** From "version.js", which is dynamically created by the build script. */
  version = VERSION;

  /** The WebSocket connection (set in "websocket.ts"). */
  conn: Connection | null = null;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

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

  // -----------------------
  // Miscellaneous variables
  // -----------------------

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

  /**
   * If the start game button is disabled due to a player leaving or joining, stores the ID of a
   * timeout designed to re-enable it.
   */
  enableStartGameButtonTimeout: NodeJS.Timeout | null = null;

  /** Equal to the data from the "game" command. */
  game: Game | null = null;

  currentScreen: Screen = Screen.Login;

  /** Equal to the table we are joined to or -1 if no table. */
  tableID = -1;

  errorOccurred = false;

  // ------------
  // UI variables
  // ------------

  imageLoader: Loader | null = null;
  ui: HanabiUI | null = null;

  /** Used to keep track of how many in-game chat messages are currently unread. */
  chatUnread = 0;

  zenModeEnabled = false;

  /** Used to keep track of the active element before model warning box. */
  lastActiveElement: HTMLElement | null = null;
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
  // We set the UI globals to `globals`, so the lobby globals can take `globals2`.
  window.globals2 = globals;
}
