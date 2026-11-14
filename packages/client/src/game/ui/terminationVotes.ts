// The votes to end a game early, shared by the classic screen's skull menu and the redesigned game
// screen's "End game" menu.

import { MIN_PLAYERS } from "@hanabi-live/game";
import { globals as lobbyGlobals } from "../../Globals.ts";

/** Casts our vote to end the game, or takes it back. */
export function setVote(voted: boolean): void {
  lobbyGlobals.connection.send("tableTerminateVote", {
    tableId: lobbyGlobals.joinedTableId,
    voted,
  });
}

/** Ends the game for everyone right away. */
export function endNow(): void {
  lobbyGlobals.connection.send("tableTerminate", {
    tableId: lobbyGlobals.joinedTableId,
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
