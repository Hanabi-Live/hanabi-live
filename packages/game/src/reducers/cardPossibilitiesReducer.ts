// Calculates the state of a card after a clue.

/* eslint-disable unicorn/no-null */

import { newArray } from "complete-common";
import { MAX_PLAYERS } from "../constants";
import { ClueType } from "../enums/ClueType";
import { getVariant } from "../gameData";
import type { CardState } from "../interfaces/CardState";
import type { GameMetadata } from "../interfaces/GameMetadata";
import { isCardTouchedByClue } from "../rules/clues";
import type { Clue } from "../types/Clue";
import type { SuitRankTuple } from "../types/SuitRankTuple";

export function cardPossibilitiesReducer(
  state: CardState,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
): CardState {
  if (state.possibleCardsFromClues.length === 1) {
    // We already know all details about this card, no need to calculate.
    return state;
  }

  const variant = getVariant(metadata.options.variantName);

  // Apply the clue and check what is eliminated.
  const possibleCardsFromClues = state.possibleCardsFromClues.filter(
    ([suitIndex, rank]) =>
      isCardTouchedByClue(variant, clue, suitIndex, rank) === positive,
  );
  const possibleCards = state.possibleCards.filter(
    ([suitIndex, rank]) =>
      isCardTouchedByClue(variant, clue, suitIndex, rank) === positive,
  );
  const possibleCardsForEmpathy = state.possibleCardsForEmpathy.filter(
    ([suitIndex, rank]) =>
      isCardTouchedByClue(variant, clue, suitIndex, rank) === positive,
  );

  let { positiveColorClues } = state;
  if (
    positive
    && clue.type === ClueType.Color
    && !positiveColorClues.includes(clue.value)
  ) {
    positiveColorClues = [...positiveColorClues, clue.value];
  }

  let { positiveRankClues } = state;
  if (
    positive
    && clue.type === ClueType.Rank
    && !positiveRankClues.includes(clue.value)
  ) {
    if (variant.oddsAndEvens) {
      positiveRankClues =
        clue.value === 1
          ? [...positiveRankClues, 1, 3, 5]
          : [...positiveRankClues, 2, 4];
    } else {
      positiveRankClues = [...positiveRankClues, clue.value];
    }
  }

  const { suitIndex, rank, suitDetermined, rankDetermined, revealedToPlayer } =
    updateIdentity(state, possibleCardsFromClues);

  const newState: CardState = {
    ...state,
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
    possibleCardsFromClues,
    possibleCards,
    possibleCardsForEmpathy,
    positiveColorClues,
    positiveRankClues,
    revealedToPlayer,
  };

  return newState;
}

/** Based on the current possibilities, updates the known identity of this card. */
function updateIdentity(
  state: CardState,
  possibleCardsFromClues: readonly SuitRankTuple[],
) {
  let { suitIndex, rank } = state;

  const possibleSuits = possibleCardsFromClues.map(
    (suitRankTuple) => suitRankTuple[0],
  );
  const possibleSuitsSet = new Set(possibleSuits);
  const suitDetermined = possibleSuitsSet.size === 1;

  if (suitDetermined) {
    suitIndex = possibleSuits[0] ?? null;
  }

  const possibleRanks = possibleCardsFromClues.map(
    (suitRankTuple) => suitRankTuple[1],
  );
  const possibleRanksSet = new Set(possibleRanks);
  const rankDetermined = possibleRanksSet.size === 1;

  if (rankDetermined) {
    rank = possibleRanks[0] ?? null;
  }

  return {
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
    revealedToPlayer:
      suitDetermined && rankDetermined
        ? newArray(MAX_PLAYERS, true)
        : state.revealedToPlayer,
  };
}
