// Joining, spectating, and returning to the tables in the lobby.

import type { PlayerIndex } from "@hanabi-live/game";
import { globals } from "../../Globals";
import * as modals from "../../modals";
import * as createGame from "../createGame";
import { Screen } from "../types/Screen";
import type { Table } from "./tablesSlice";

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
    tableID: table.tableID,
    shadowingPlayerIndex,
  });
  // (We will get a "tableStart" response back from the server.)
}

export function tableJoin(table: Table): void {
  if (
    globals.currentScreen !== Screen.Lobby
    && globals.currentScreen !== Screen.PreGame
  ) {
    return;
  }

  if (table.passwordProtected) {
    modals.askForPassword(table.tableID);
  } else {
    globals.conn!.send("tableJoin", {
      tableID: table.tableID,
    });

    // Prepare the Change Options dialog for guest.
    createGame.ready();
    // (We will get a "joined" response back from the server.)
  }
}

export function tableReattend(table: Table): void {
  if (globals.currentScreen !== Screen.Lobby) {
    return;
  }

  globals.conn!.send("tableReattend", {
    tableID: table.tableID,
  });
  // (We will get either a "game" or a "tableStart" response back from the server, depending on if
  // the game has started or not.)
}
