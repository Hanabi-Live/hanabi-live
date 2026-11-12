// Joining, spectating, and returning to the tables in the lobby.

import type { PlayerIndex } from "@hanabi-live/game";
import { globals } from "../../Globals.ts";
import * as modals from "../../modals.ts";
import { Screen } from "../types/Screen.ts";
import type { Table } from "./tablesSlice.ts";

export function tableSpectate(
  table: Table,
  shadowingPlayerIndex?: PlayerIndex,
): void {
  if (
    globals.currentScreen !== Screen.Lobby
    && globals.currentScreen !== Screen.PreGame
  ) {
    return;
  }

  globals.conn!.send("tableSpectate", {
    tableId: table.tableId,
    shadowingPlayerIndex,
  });
  // (We will get a "tableJoined" response back from the server.)
}

export function tableJoin(table: Table): void {
  if (
    globals.currentScreen !== Screen.Lobby
    && globals.currentScreen !== Screen.PreGame
  ) {
    return;
  }

  if (table.passwordProtected) {
    modals.askForPassword(table.tableId);
  } else {
    globals.conn!.send("tableJoin", {
      tableId: table.tableId,
    });
    // (We will get a "tableJoined" response back from the server.)
  }
}

export function tableReattend(table: Table): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableReattend", {
    tableId: table.tableId,
  });
  // (We will get a "tableJoined" response back from the server, whose stage says whether the game
  // has started.)
}
