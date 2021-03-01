// Miscellaneous helpers used by several reducers

import { getCharacter } from "../data/gameData";
import { statsRules } from "../rules";
import Color from "../types/Color";
import GameState from "../types/GameState";
import Suit from "../types/Suit";
import Variant from "../types/Variant";

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

export function getIndexConverter(
  variant: Variant,
): <T extends Color | Suit>(value: T) => number {
  const suitIndexes = new Map<string, number>();
  const colorIndexes = new Map<Color, number>();
  variant.suits.forEach((suit, index) => suitIndexes.set(suit.name, index));
  variant.clueColors.forEach((color, index) => colorIndexes.set(color, index));

  function getIndex<T extends Suit | Color>(value: T): number {
    // HACK: test a member of the interface that is exclusive to Suit
    if ((value as Suit).reversed !== undefined) {
      return suitIndexes.get(value.name)!;
    }
    return colorIndexes.get(value)!;
  }

  return getIndex;
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

export function getCharacterIDForPlayer(
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
