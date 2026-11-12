// The votes to end a game early, shared by the classic screen's skull menu and the redesigned game
// screen's "End game" menu.

import { MIN_PLAYERS } from "@hanabi-live/game";
import { globals } from "./UiGlobals.ts";

/** Casts our vote to end the game, or takes it back if we already voted. */
export function toggleVote(): void {
  globals.lobby.conn!.send("tableTerminateVote", {
    tableId: globals.lobby.joinedTableId,
  });
}

/** Ends the game for everyone right away. */
export function endNow(): void {
  globals.lobby.conn!.send("tableTerminate", {
    tableId: globals.lobby.joinedTableId,
  });
}

/** Who must vote to end the game, such as "all 4 players". */
export function votersText(needed: number, numPlayers: number): string {
  if (needed < numPlayers) {
    return `${needed} of ${numPlayers} players`;
  }
  return numPlayers === MIN_PLAYERS
    ? "both players"
    : `all ${numPlayers} players`;
}
