// These are exported global variables to be shared between all of the TypeScript code.

import type { ServerCommandData, Settings, UserID } from "@hanabi-live/data";
import type { Connection } from "./Connection";
import type { Loader } from "./Loader";
import { NO_TABLE_ID } from "./constants";
import type { HanabiUI } from "./game/ui/HanabiUI";
import { totalGamesChanged } from "./lobby/gameHistory/historySlice";
import type { Game } from "./lobby/pregame/pregameSlice";
import { gameChanged } from "./lobby/pregame/pregameSlice";
import type { Table } from "./lobby/tables/tablesSlice";
import { selectTable, selectTables } from "./lobby/tables/tablesSlice";
import type { Screen } from "./lobby/types/Screen";
import {
  blockedChanged,
  errorOccurredChanged,
  friendsChanged,
  screenChanged,
  settingsChanged,
  userIDChanged,
  usernameChanged,
} from "./sessionSlice";
import { store } from "./store";

export class Globals {
  /** The WebSocket connection (set in "websocketInit.ts"). */
  conn: Connection | undefined = undefined;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

  muted = false;

  // ----------------------------------------------------------------
  // Values that React components read (which are stored in "store.ts")
  // ----------------------------------------------------------------

  /* eslint-disable @typescript-eslint/class-methods-use-this -- These delegate to the store. */

  /** From the "welcome" message, or `NO_USER_ID` before it. */
  get userID(): number {
    return store.getState().session.userID;
  }

  set userID(userID: number) {
    store.dispatch(userIDChanged(userID));
  }

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

  /** From the "welcome" and "blocked" messages. */
  get blocked(): readonly string[] {
    return store.getState().session.blocked;
  }

  set blocked(blocked: readonly string[]) {
    store.dispatch(blockedChanged(blocked));
  }

  /**
   * From the "welcome" message. The "Settings" page and the "Create Game" page change them. Replace
   * the whole object to change one, because the store freezes it.
   */
  get settings(): Settings {
    return store.getState().session.settings;
  }

  set settings(settings: Settings) {
    store.dispatch(settingsChanged(settings));
  }

  get currentScreen(): Screen {
    return store.getState().session.screen;
  }

  set currentScreen(screen: Screen) {
    store.dispatch(screenChanged(screen));
  }

  /** From the "welcome" and "lobbyStatus" messages. */
  get totalGames(): number | undefined {
    return store.getState().history.totalGames;
  }

  set totalGames(totalGames: number | undefined) {
    store.dispatch(totalGamesChanged(totalGames));
  }

  /** From the "tableList", "table", and "tableGone" messages. */
  get tables(): readonly Table[] {
    return selectTables(store.getState());
  }

  getTable(tableID: number): Table | undefined {
    return selectTable(store.getState(), tableID);
  }

  /** From the "pregame" message. */
  get game(): Game | undefined {
    return store.getState().pregame.game;
  }

  set game(game: Game | undefined) {
    store.dispatch(gameChanged(game));
  }

  get errorOccurred(): boolean {
    return store.getState().session.errorOccurred;
  }

  set errorOccurred(errorOccurred: boolean) {
    store.dispatch(errorOccurredChanged(errorOccurred));
  }

  /* eslint-enable @typescript-eslint/class-methods-use-this */

  // -----------------------
  // Miscellaneous variables
  // -----------------------

  /** Keys are IDs. */
  userMap = new Map<UserID, ServerCommandData["user"]>();

  /** Keys are IDs. */

  totalGamesFriends = 0;

  idleMinutes = 0;

  /** Equal to the table we are joined to or `NO_TABLE_ID` if no table. */
  tableID = NO_TABLE_ID;

  // ------------
  // UI variables
  // ------------

  imageLoader: Loader | undefined = undefined;
  ui: HanabiUI | undefined = undefined;

  /** Used to keep track of how many in-game chat messages are currently unread. */
  chatUnread = 0;

  zenModeEnabled = false;

  /** Used to keep track of the active element before model warning box. */
  lastActiveElement: HTMLElement | undefined = undefined;
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
