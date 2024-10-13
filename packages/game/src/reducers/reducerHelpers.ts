// Miscellaneous helpers used by several reducers.

import { assertDefined } from "complete-common";
import { getCharacter } from "../gameData";
import type { GameState } from "../interfaces/GameState";
import { getEfficiency } from "../rules/stats";
import type { PlayerIndex } from "../types/PlayerIndex";

export function getCharacterNameForPlayer(
  playerIndex: PlayerIndex | null,
  characterAssignments: Readonly<Array<number | null>>,
): string {
  const characterID = getCharacterIDForPlayer(
    playerIndex,
    characterAssignments,
  );

  return characterID === null ? "" : getCharacter(characterID).name;
}

function getCharacterIDForPlayer(
  playerIndex: PlayerIndex | null,
  characterAssignments: Readonly<Array<number | null>>,
): number | null {
  if (playerIndex === null) {
    return null; // eslint-disable-line unicorn/no-null
  }

  const characterID = characterAssignments[playerIndex];
  assertDefined(
    characterID,
    `The character ID for player ${playerIndex} was undefined.`,
  );

  return characterID;
}

export function getEfficiencyFromGameState(gameState: GameState): number {
  return getEfficiency(
    gameState.stats.cardsGotten,
    gameState.stats.potentialCluesLost,
  );
}
