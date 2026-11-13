// These are exported global variables to be shared between all of the TypeScript code.

import type { ServerEventData, TableId, UserId } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import type { Connection } from "./Connection.ts";
import type { Loader } from "./Loader.ts";
import type { HanabiUi } from "./game/ui/HanabiUi.ts";

export class Globals {
  /** The WebSocket connection (set in "websocketInit.ts"). */
  conn: Connection | undefined = undefined;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

  muted = false;

  // -----------------------
  // Miscellaneous variables
  // -----------------------

  /** Keys are IDs. */
  userMap = new Map<UserId, ServerEventData["user"]>();

  /** Keys are IDs. */

  totalGamesFriends = 0;

  idleMinutes = 0;

  /** The table we are joined to, if any. */
  tableId: TableId | undefined = undefined;

  /** The table we are joined to, for code that only runs at a table. */
  get joinedTableId(): TableId {
    assertDefined(this.tableId, "We are not joined to a table.");
    return this.tableId;
  }

  // ------------
  // UI variables
  // ------------

  imageLoader: Loader | undefined = undefined;
  ui: HanabiUi | undefined = undefined;

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
