import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { Options } from "../interfaces/Options.ts";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";

export function getNextPlayerIndex(
  currentPlayerIndex: PlayerIndex | undefined,
  numPlayers: NumPlayers,
): PlayerIndex | undefined {
  // If the game is already over, then there is no next player.
  if (currentPlayerIndex === undefined) {
    return undefined;
  }

  let nextPlayerIndex = currentPlayerIndex + 1;
  if (nextPlayerIndex === numPlayers) {
    nextPlayerIndex = 0;
  }

  return nextPlayerIndex as PlayerIndex;
}

/** Each player gets one more turn after the final card is drawn. */
export function getEndGameLength(options: Options): number {
  return options.numPlayers;
}

export function getEndTurn(turn: number, metadata: GameMetadata): number {
  return turn + getEndGameLength(metadata.options);
}
