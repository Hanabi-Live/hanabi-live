// Miscellaneous helpers used by several reducers.

import { getCharacter } from "../gameData";
import type { GameState } from "../interfaces/GameState";
import { getEfficiency } from "../rules/stats";
import type { PlayerIndex } from "../types/PlayerIndex";

export function getCharacterNameForPlayer(
  playerIndex: PlayerIndex | undefined,
  characterAssignments: Readonly<Array<number | undefined>>,
): string {
  const characterID = getCharacterIDForPlayer(
    playerIndex,
    characterAssignments,
  );

  return characterID === undefined ? "" : getCharacter(characterID).name;
}

function getCharacterIDForPlayer(
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
