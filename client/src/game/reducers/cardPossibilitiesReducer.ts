// Calculates the state of a card after a clue

import { getVariant } from '../data/gameData';
import { cluesRules } from '../rules';
import CardState from '../types/CardState';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import Variant from '../types/Variant';

const cardPossibilitiesReducer = (
  state: CardState,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
): CardState => {
  if (
    state.possibleCardsFromClues.length === 1
  ) {
    // We already know all details about this card, no need to calculate
    return state;
  }

  const variant : Variant = getVariant(metadata.options.variantName);

  // Apply the clue and check what is eliminated
  const possibleCardsFromClues = state.possibleCardsFromClues.filter(
    ([suitIndex, rank]) => cluesRules.touchesCard(variant, clue, suitIndex, rank) === positive,
  );

  let positiveRankClues = state.positiveRankClues;
  if (positive && clue.type === ClueType.Rank && !positiveRankClues.includes(clue.value)) {
    positiveRankClues = [...positiveRankClues, clue.value];
  }

  const {
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
  } = updateIdentity(state, possibleCardsFromClues);

  const newState: CardState = {
    ...state,
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
    possibleCardsFromClues,
    positiveRankClues,
  };

  return newState;
};

export default cardPossibilitiesReducer;

// Based on the current possibilities, updates the known identity of this card
const updateIdentity = (
  state: CardState,
  possibleCardsFromClues: ReadonlyArray<readonly [number, number]>,
) => {
  let { suitIndex, rank } = state;

  const possibleSuits = new Set(possibleCardsFromClues.map((x) => x[0]));
  const possibleRanks = new Set(possibleCardsFromClues.map((x) => x[1]));

  if (possibleSuits.size === 1) {
    // We have discovered the true suit of the card
    [suitIndex] = possibleSuits;
  }

  if (possibleRanks.size === 1) {
    // We have discovered the true rank of the card
    [rank] = possibleRanks;
  }

  return {
    suitIndex,
    rank,
    suitDetermined: possibleSuits.size === 1,
    rankDetermined: possibleRanks.size === 1,
  };
};
