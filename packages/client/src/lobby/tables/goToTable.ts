import { store } from "../../store.ts";
import { tableJoin, tableReattend, tableSpectate } from "./tableActions.ts";
import type { Table } from "./tablesSlice.ts";
import { getAction, isPlayer } from "./tablesSlice.ts";

/** Goes to a table: back to our own game, or to join or watch another one. */
export function goToTable(table: Table): void {
  const joined = isPlayer(table, store.getState().session.username);
  switch (getAction(table, joined)) {
    case "join": {
      // Trying to join a full table tells its players that someone else wants to play.
      tableJoin(table);
      break;
    }

    case "spectate": {
      tableSpectate(table);
      break;
    }

    case "resume": {
      tableReattend(table);
      break;
    }
  }
}
