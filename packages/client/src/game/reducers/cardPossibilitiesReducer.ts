// Calculates the state of a card after a clue

import { getVariant, Variant } from "@hanabi/data";
import * as cluesRules from "../rules/clues";
import { isOddsAndEvens } from "../rules/variant";
import CardState from "../types/CardState";
import Clue from "../types/Clue";
import ClueType from "../types/ClueType";
import GameMetadata from "../types/GameMetadata";

export default function cardPossibilitiesReducer(
  state: CardState,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
): CardState {
  if (state.possibleCardsFromClues.length === 1) {
    // We already know all details about this card, no need to calculate
    return state;
  }

  const variant: Variant = getVariant(metadata.options.variantName);

  // Apply the clue and check what is eliminated
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
    if (isOddsAndEvens(variant)) {
      if (clue.value === 1) {
        positiveRankClues = [...positiveRankClues, ...[1, 3, 5]];
      } else {
        positiveRankClues = [...positiveRankClues, ...[2, 4]];
      }
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

// Based on the current possibilities, updates the known identity of this card
function updateIdentity(
  state: CardState,
  possibleCardsFromClues: ReadonlyArray<readonly [number, number]>,
) {
  let { suitIndex, rank } = state;

  const possibleSuits = new Set(possibleCardsFromClues.map((x) => x[0]));
  const possibleRanks = new Set(possibleCardsFromClues.map((x) => x[1]));

  const suitDetermined = possibleSuits.size === 1;
  const rankDetermined = possibleRanks.size === 1;

  if (suitDetermined) {
    // We have discovered the true suit of the card
    [suitIndex] = possibleSuits;
  }

  if (rankDetermined) {
    // We have discovered the true rank of the card
    [rank] = possibleRanks;
  }

  return {
    suitIndex,
    rank,
    suitDetermined,
    rankDetermined,
    revealedToPlayer:
      suitDetermined && rankDetermined
        ? new Array(6).fill(true)
        : state.revealedToPlayer,
  };
}
