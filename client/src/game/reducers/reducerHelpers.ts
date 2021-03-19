// Miscellaneous helpers used by several reducers

import { getCharacter } from "../data/gameData";
import { statsRules } from "../rules";
import GameState from "../types/GameState";

export function getEfficiency(state: GameState): number {
  return statsRules.efficiency(
    state.stats.cardsGotten,
    state.stats.potentialCluesLost,
  );
}

export function getFutureEfficiency(state: GameState): number | null {
  if (state.stats.cluesStillUsable === null) {
    return null;
  }

  const cardsNotGotten = state.stats.maxScore - state.stats.cardsGotten;
  return statsRules.efficiency(cardsNotGotten, state.stats.cluesStillUsable);
}

export function getCharacterNameForPlayer(
  playerIndex: number | null,
  characterAssignments: Readonly<Array<number | null>>,
): string {
  const characterID = getCharacterIDForPlayer(
    playerIndex,
    characterAssignments,
  );

  return characterID === null ? "" : getCharacter(characterID).name;
}

function getCharacterIDForPlayer(
  playerIndex: number | null,
  characterAssignments: Readonly<Array<number | null>>,
): number | null {
  if (playerIndex === null) {
    return null;
  }

  const characterID = characterAssignments[playerIndex];
  if (characterID === undefined) {
    throw new Error(
      `The character ID for player ${playerIndex} was undefined.`,
    );
  }

  return characterID;
}
