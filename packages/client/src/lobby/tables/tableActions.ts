// Joining, spectating, and returning to the tables in the lobby.

import type { PlayerIndex } from "@hanabi-live/game";
import { globals } from "../../Globals.ts";
import * as modals from "../../modals.ts";
import { store } from "../../store.ts";
import { Screen } from "../types/Screen.ts";
import type { Table } from "./tablesSlice.ts";

export function tableSpectate(
  table: Table,
  shadowingPlayerIndex?: PlayerIndex,
): void {
  if (
    store.getState().session.screen !== Screen.Lobby
    && store.getState().session.screen !== Screen.PreGame
  ) {
    return;
  }

  globals.connection.send("tableSpectate", {
    tableId: table.tableId,
    shadowingPlayerIndex,
  });
  // (We will get a "tableJoined" response back from the server.)
}

export function tableJoin(table: Table): void {
  if (
    store.getState().session.screen !== Screen.Lobby
    && store.getState().session.screen !== Screen.PreGame
  ) {
    return;
  }

  if (table.passwordProtected) {
    modals.askForPassword(table.tableId);
  } else {
    globals.connection.send("tableJoin", {
      tableId: table.tableId,
    });
    // (We will get a "tableJoined" response back from the server.)
  }
}

export function tableReattend(table: Table): void {
  if (store.getState().session.screen !== Screen.Lobby) {
    return;
  }

  globals.connection.send("tableReattend", {
    tableId: table.tableId,
  });
  // (We will get a "tableJoined" response back from the server, whose stage says whether the game
  // has started.)
}
