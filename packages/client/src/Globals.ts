// These are exported global variables to be shared between all of the TypeScript code.

import type { TableId } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import type { Connection } from "./Connection.ts";
import type { Loader } from "./Loader.ts";
import type { HanabiUi } from "./game/ui/HanabiUi.ts";

class Globals {
  /** The WebSocket connection (set in "websocketInit.ts"). */
  conn: Connection | undefined = undefined;

  // ----------------------------------------
  // Values from the server "welcome" message
  // ----------------------------------------

  muted = false;

  // -----------------------
  // Miscellaneous variables
  // -----------------------

  /** The table we are joined to, if any. */
  tableId: TableId | undefined = undefined;

  // ------------
  // UI variables
  // ------------

  /** Preloads the game screen's images (set in "main.ts"). */
  loader: Loader | undefined = undefined;
  ui: HanabiUi | undefined = undefined;

  zenModeEnabled = false;

  /** The WebSocket connection, for code that only runs once the client has connected. */
  get connection(): Connection {
    assertDefined(this.conn, "The WebSocket connection is not open yet.");
    return this.conn;
  }

  /** The image loader, for code that only runs after the page has loaded. */
  get imageLoader(): Loader {
    assertDefined(this.loader, "The image loader has not been created yet.");
    return this.loader;
  }

  /** The table we are joined to, for code that only runs at a table. */
  get joinedTableId(): TableId {
    assertDefined(this.tableId, "We are not joined to a table.");
    return this.tableId;
  }
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
// eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-global-object-property-assignment
window.globals2 = globals;
