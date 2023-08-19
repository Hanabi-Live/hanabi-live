// Calculates the state of a card after a clue.

import type { SuitRankTuple, Variant } from "@hanabi/data";
import { MAX_PLAYERS, getVariant } from "@hanabi/data";
import * as cluesRules from "../rules/clues";
import type { CardState } from "../types/CardState";
import type { Clue } from "../types/Clue";
import { ClueType } from "../types/ClueType";
import type { GameMetadata } from "../types/GameMetadata";

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

  const variant: Variant = getVariant(metadata.options.variantName);

  // Apply the clue and check what is eliminated.
  const possibleCardsFromClues = state.possibleCardsFromClues.filter(
    ([suitIndex, rank]) =>
      cluesRules.touchesCard(variant, clue, suitIndex, rank) === positive,
  );
  const possibleCards = state.possibleCards.filter(
    ([suitIndex, rank]) =>
      cluesRules.touchesCard(variant, clue, suitIndex, rank) === positive,
  );
  const possibleCardsForEmpathy = state.possibleCardsForEmpathy.filter(
    ([suitIndex, rank]) =>
      cluesRules.touchesCard(variant, clue, suitIndex, rank) === positive,
  );

  let { positiveColorClues } = state;
  if (
    positive &&
    clue.type === ClueType.Color &&
    !positiveColorClues.includes(clue.value)
  ) {
    positiveColorClues = [...positiveColorClues, clue.value];
  }

  let { positiveRankClues } = state;
  if (
    positive &&
    clue.type === ClueType.Rank &&
    !positiveRankClues.includes(clue.value)
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

// Based on the current possibilities, updates the known identity of this card.
function updateIdentity(
  state: CardState,
  possibleCardsFromClues: readonly SuitRankTuple[],
) {
  let { suitIndex, rank } = state;

  const possibleSuits = new Set(possibleCardsFromClues.map((x) => x[0]));
  const possibleRanks = new Set(possibleCardsFromClues.map((x) => x[1]));

  const suitDetermined = possibleSuits.size === 1;
  const rankDetermined = possibleRanks.size === 1;

  if (suitDetermined) {
    // We have discovered the true suit of the card.
    const [firstPossibleSuit] = possibleSuits;
    suitIndex = firstPossibleSuit!;
  }

  if (rankDetermined) {
    // We have discovered the true rank of the card.
    const [firstPossibleRank] = possibleRanks;
    rank = firstPossibleRank!;
  }

  return {
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
    revealedToPlayer:
      suitDetermined && rankDetermined
        ? new Array(MAX_PLAYERS).fill(true)
        : state.revealedToPlayer,
  };
}
