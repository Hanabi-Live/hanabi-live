// Miscellaneous helpers used by several reducers.

import { getCharacter } from "../gameData.ts";
import type { GameState } from "../interfaces/GameState.ts";
import { getEfficiency } from "../rules/stats.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";

export function getCharacterNameForPlayer(
  playerIndex: PlayerIndex | undefined,
  characterAssignments: Readonly<Array<number | undefined>>,
): string {
  const characterId = getCharacterIdForPlayer(
    playerIndex,
    characterAssignments,
  );

  return characterId === undefined ? "" : getCharacter(characterId).name;
}

function getCharacterIdForPlayer(
  playerIndex: PlayerIndex | undefined,
  characterAssignments: Readonly<Array<number | undefined>>,
): number | undefined {
  if (playerIndex === undefined) {
    return undefined;
  }

  // Undefined when the player has no character.
  return characterAssignments[playerIndex];
}

export function getEfficiencyFromGameState(gameState: GameState): number {
  return getEfficiency(
    gameState.stats.cardsGotten,
    gameState.stats.potentialCluesLost,
  );
}
