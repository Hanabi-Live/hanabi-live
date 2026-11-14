// What the buttons of the navigation bar do, which their hotkeys also do.

import { MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { globals } from "../../Globals.ts";
import { showWarning } from "../../modals.ts";
import type { RootState } from "../../store.ts";
import { store } from "../../store.ts";
import * as pregame from "../pregame/pregame.ts";
import { startGameSentChanged } from "../pregame/pregameSlice.ts";
import { tableJoin, tableSpectate } from "../tables/tableActions.ts";
import { isPlayer, selectTable, selectTables } from "../tables/tablesSlice.ts";

/** Whether we can start the game: we own the table, and it has enough players. */
export function selectCanStartGame(state: RootState): boolean {
  const { game, startGameSent, startGameCooldown } = state.pregame;
  return (
    game !== undefined
    && game.owner.userId === state.session.userId
    && game.players.length >= MIN_PLAYERS
    && game.players.length <= MAX_PLAYERS
    && !startGameSent
    && !startGameCooldown
  );
}

/** A spectator can join the game, and a player can spectate it instead. */
export function selectJoinButton(state: RootState): {
  readonly type: "join" | "spectate";
  readonly enabled: boolean;
} {
  const { game } = state.pregame;
  if (game === undefined) {
    return {
      type: "join",
      enabled: false,
    };
  }

  const seated = game.players.some(
    (player) => player.username === state.session.username,
  );
  return seated
    ? {
        type: "spectate",
        enabled: game.players.length >= MIN_PLAYERS,
      }
    : {
        type: "join",
        enabled: game.players.length < game.settings.maxPlayers,
      };
}

export function startGame(): void {
  store.dispatch(startGameSentChanged(true));
  globals.connection.send(
    "tableStart",
    {
      tableId: globals.joinedTableId,
      intendedPlayerIds:
        store.getState().pregame.game?.players.map((player) => player.userId)
        ?? [],
    },
    () => {
      // The started game arrives before the reply. A start that the server refused or ignored, such
      // as one from an outdated view, can be sent again.
      store.dispatch(startGameSentChanged(false));
    },
  );
}

export function joinGame(): void {
  const table = selectTable(store.getState(), globals.joinedTableId);
  if (table === undefined) {
    return;
  }

  const oldTable = selectTables(store.getState()).find(
    (value) =>
      isPlayer(value, store.getState().session.username)
      && value.phase.type !== "sharedReplay",
  );
  if (oldTable !== undefined) {
    if (oldTable.phase.type !== "pregame") {
      showWarning(
        "You cannot join more than one table at a time. Terminate your other game before joining a new one.",
      );
      return;
    }
    globals.connection.send("tableLeave", { tableId: oldTable.tableId });
  }
  tableJoin(table);
}

export function spectateGame(): void {
  const table = selectTable(store.getState(), globals.joinedTableId);
  if (table === undefined) {
    return;
  }

  globals.connection.send("tableLeave", { tableId: globals.joinedTableId });
  tableSpectate(table);
}

export function returnToLobby(): void {
  pregame.hide();
  globals.connection.send("tableUnattend", { tableId: globals.joinedTableId });
  globals.tableId = undefined;
}

export function leaveGame(): void {
  // "Leave Game" and "Return to Lobby" are the same for spectators.
  const table = selectTable(store.getState(), globals.joinedTableId);
  if (table === undefined) {
    return;
  }

  if (
    table.spectators.some(
      (spectator) => spectator.username === store.getState().session.username,
    )
  ) {
    returnToLobby();
  } else {
    globals.connection.send("tableLeave", { tableId: globals.joinedTableId });
  }
}
