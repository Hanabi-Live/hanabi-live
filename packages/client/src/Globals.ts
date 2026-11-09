// These are exported global variables to be shared between all of the TypeScript code.

import type { GameHistory, ServerCommandData, UserID } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import type { Connection } from "./Connection";
import type { Loader } from "./Loader";
import { NO_TABLE_ID, NO_USER_ID } from "./constants";
import type { HanabiUI } from "./game/ui/HanabiUI";
import type { Screen } from "./lobby/types/Screen";
import { friendsChanged, screenChanged, usernameChanged } from "./sessionSlice";
import { store } from "./store";

type Game = ServerCommandData["game"];

export class Globals {
  /** The WebSocket connection (set in "websocketInit.ts"). */
  conn: Connection | null = null;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

  userID = NO_USER_ID;
  totalGames: number | null = null;
  muted = false;

  /** Contains the settings for the "Settings" tooltip and the "Create Game" tooltip. */
  settings = defaultSettings;

  // ----------------------------------------------------------------
  // Values that React components read (which are stored in "store.ts")
  // ----------------------------------------------------------------

  /* eslint-disable @typescript-eslint/class-methods-use-this -- These delegate to the store. */

  /** From the "welcome" message. */
  get username(): string {
    return store.getState().session.username;
  }

  set username(username: string) {
    store.dispatch(usernameChanged(username));
  }

  /** From the "welcome" and "friends" messages. */
  get friends(): readonly string[] {
    return store.getState().session.friends;
  }

  set friends(friends: readonly string[]) {
    store.dispatch(friendsChanged(friends));
  }

  get currentScreen(): Screen {
    return store.getState().session.screen;
  }

  set currentScreen(screen: Screen) {
    store.dispatch(screenChanged(screen));
  }

  /* eslint-enable @typescript-eslint/class-methods-use-this */

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
