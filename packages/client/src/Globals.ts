// These are exported global variables to be shared between all of the TypeScript code.

import type { GameHistory, ServerCommandData, UserID } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import type { Connection } from "./Connection";
import type { Loader } from "./Loader";
import { NO_TABLE_ID } from "./constants";
import type { HanabiUI } from "./game/ui/HanabiUI";
import { Screen } from "./lobby/types/Screen";

type Game = ServerCommandData["game"];

export class Globals {
  /** The WebSocket connection (set in "websocketInit.ts"). */
  conn: Connection | null = null;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

  userID = -1;
  username = "";
  totalGames: number | null = null;
  muted = false;

  /** Contains the settings for the "Settings" tooltip and the "Create Game" tooltip. */
  settings = defaultSettings;

  friends: readonly string[] = [];

  // -----------------------
  // Miscellaneous variables
  // -----------------------

  /** Keys are IDs. */
  userMap = new Map<UserID, ServerCommandData["user"]>();

  /** Keys are IDs. */
  tableMap = new Map<number, ServerCommandData["table"]>();

  /** Keys are IDs. */
  history = new Map<number, GameHistory>();

  /** Keys are IDs. */

  totalGamesFriends = 0;

  peopleTyping: string[] = [];

  idleMinutes = 0;

  /**
   * If the start game button is disabled due to a player leaving or joining, stores the ID of a
   * timeout designed to re-enable it.
   */
  enableStartGameButtonTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Equal to the data from the "game" command. */
  game: Game | null = null;

  currentScreen: Screen = Screen.Login;

  /** Equal to the table we are joined to or `NO_TABLE_ID` if no table. */
  tableID = NO_TABLE_ID;

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
// We set the UI globals to `globals`, so the lobby globals take `globals2`.
// eslint-disable-next-line unicorn/prefer-global-this
window.globals2 = globals;
