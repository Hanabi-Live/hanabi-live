// Calculates the state of a card after a clue

import { getVariant } from '../data/gameData';
import {
  applyColorClue,
  applyRankClue,
  checkAllPipPossibilities,
  removePossibilities,
} from '../rules/applyClueCore';
import * as variantRules from '../rules/variant';
import CardState, { PipState, ClueMemory } from '../types/CardState';
import Clue, { rankClue, colorClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import { getIndexConverter } from './reducerHelpers';

const cardPossibilitiesReducer = (
  state: CardState,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
): CardState => {
  if (
    state.colorClueMemory.possibilities.length === 1
    && state.rankClueMemory.possibilities.length === 1
  ) {
    // We already know all details about this card, no need to calculate
    return state;
  }

  const variant = getVariant(metadata.options.variantName);

  // Don't calculate possibilities on speedrun (perf optimization)
  // or on "Throw it in a Hole" since the player can't see the played cards
  // TODO: move to rules
  const calculatePossibilities = !metadata.options.speedrun
    && !variantRules.isThrowItInAHole(variant);

  const getIndex = getIndexConverter(variant);

  // Apply the clue and check what is eliminated
  const {
    suitsRemoved,
    ranksRemoved,
    impossibleCards,
  } = clue.type === ClueType.Color
    ? applyColorClue(state, clue, positive, calculatePossibilities, variant)
    : applyRankClue(state, clue, positive, calculatePossibilities, variant);

  // Remember the clue for the future
  const isColorClue = clue.type === ClueType.Color;
  const valueIndex = clue.type === ClueType.Color ? getIndex(clue.value) : clue.value;
  const memory = isColorClue ? state.colorClueMemory : state.rankClueMemory;
  let thisTypePositiveClues = memory.positiveClues;
  let thisTypeNegativeClues = memory.negativeClues;

  if (positive && !memory.positiveClues.includes(valueIndex)) {
    thisTypePositiveClues = [...memory.positiveClues, valueIndex];
  }

  if (!positive && !memory.negativeClues.includes(valueIndex)) {
    thisTypeNegativeClues = [...memory.negativeClues, valueIndex];
  }

  let suitsPossible: boolean[] | null = null;
  let ranksPossible: boolean[] | null = null;
  let possibleCards = state.possibleCards;

  if (calculatePossibilities) {
    // Now that this card has been given a clue and we have more information,
    // eliminate card possibilities that are now impossible
    for (const suitRemoved of suitsRemoved) {
      for (const rank of variant.ranks) {
        impossibleCards.push({ suitIndex: suitRemoved, rank });
      }
    }
    for (const rankRemoved of ranksRemoved) {
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        impossibleCards.push({ suitIndex, rank: rankRemoved });
      }
    }

    // Remove all the possibilities we found
    const possibilitiesToRemove = (impossibleCards.map((c) => ({
      suitIndex: c.suitIndex!,
      rank: c.rank!,
      all: true,
    })));
    possibleCards = removePossibilities(possibleCards, possibilitiesToRemove);

    const pipPossibilities = checkAllPipPossibilities(possibleCards, variant);
    suitsPossible = pipPossibilities.suitsPossible;
    ranksPossible = pipPossibilities.ranksPossible;
  }

  // Bring the result back to the state
  const rankPossibilities = state.rankClueMemory.possibilities
    .filter((r) => !ranksRemoved.includes(r));

  const suitPossibilities = state.colorClueMemory.possibilities
    .filter((r) => !suitsRemoved.includes(r));

  // Use the calculated information to hide/eliminate pips
  const suitPips = updatePipStates(
    state.colorClueMemory.pipStates,
    suitsRemoved,
    suitsPossible,
  );
  const rankPips = updatePipStates(
    state.rankClueMemory.pipStates,
    ranksRemoved,
    ranksPossible,
  );

  const {
    suitIndex,
    rank,
    identityDetermined,
  } = updateIdentity(state, suitPossibilities, rankPossibilities);

  let newState: CardState = {
    ...state,
    suitIndex,
    rank,
    identityDetermined,
    possibleCards,
    rankClueMemory: {
      positiveClues: isColorClue ? state.rankClueMemory.positiveClues : thisTypePositiveClues,
      negativeClues: isColorClue ? state.rankClueMemory.negativeClues : thisTypeNegativeClues,
      possibilities: rankPossibilities,
      pipStates: rankPips,
    },
    colorClueMemory: {
      positiveClues: isColorClue ? thisTypePositiveClues : state.colorClueMemory.positiveClues,
      negativeClues: isColorClue ? thisTypeNegativeClues : state.colorClueMemory.negativeClues,
      possibilities: suitPossibilities,
      pipStates: suitPips,
    },
  };

  // Reapply rank clues if we removed a special suit
  const shouldReapplyRankClues = calculatePossibilities
    && suitsRemoved
      .map((i) => variant.suits[i])
      .some((s) => s.allClueRanks || s.noClueRanks);

  if (shouldReapplyRankClues) {
    newState = reapplyClues(newState, ClueType.Rank, metadata);
  }

  // Reapply suit clues if we removed the special rank
  const shouldReapplyColorClues = calculatePossibilities
    && (variant.specialAllClueColors || variant.specialNoClueColors)
    && ranksRemoved.some((r) => r === variant.specialRank);

  if (shouldReapplyColorClues) {
    newState = reapplyClues(newState, ClueType.Color, metadata);
  }

  return newState;
};

export default cardPossibilitiesReducer;

function reapplyClues(state: CardState, clueType: ClueType, metadata: GameMetadata) {
  const isColorType = clueType === ClueType.Color;
  const colors = isColorType ? getVariant(metadata.options.variantName).clueColors : null;

  const memory = isColorType ? state.colorClueMemory : state.rankClueMemory;
  const { positiveClues, negativeClues } = memory;

  // Reapplying clues means starting from scratch
  const memoryWithoutClues: ClueMemory = {
    ...memory,
    negativeClues: [],
    positiveClues: [],
  };
  let newState = {
    ...state,
    rankClueMemory: (isColorType ? state.rankClueMemory : memoryWithoutClues),
    colorClueMemory: (isColorType ? memoryWithoutClues : state.colorClueMemory),
  };

  // Recurse
  for (const clueValue of positiveClues) {
    const value = isColorType ? colorClue(colors![clueValue]) : rankClue(clueValue);
    newState = cardPossibilitiesReducer(newState, value, true, metadata);
  }
  for (const clueValue of negativeClues) {
    const value = isColorType ? colorClue(colors![clueValue]) : rankClue(clueValue);
    newState = cardPossibilitiesReducer(newState, value, false, metadata);
  }

  return newState;
}

function updatePipStates(
  pipStates: readonly PipState[],
  pipsRemoved: number[],
  pipsPossible: boolean[] | null,
) {
  return pipStates.map((pip, i) => {
    // Hide the removed pips
    if (pipsRemoved.includes(i)) {
      return 'Hidden';
    }
    // Mark pips that are not hidden but not possible as eliminated
    if (pipsPossible !== null && !pipsPossible[i] && pip !== 'Hidden') {
      return 'Eliminated';
    }
    return pip;
  });
}

// Based on the current possibilities, updates the known identity of this card
function updateIdentity(
  state: CardState,
  possibleSuits: readonly number[],
  possibleRanks: readonly number[],
) {
  let { suitIndex, rank, identityDetermined } = state;

  if (possibleSuits.length === 1) {
    // We have discovered the true suit of the card
    [suitIndex] = possibleSuits;
  }

  if (possibleRanks.length === 1) {
    // We have discovered the true rank of the card
    [rank] = possibleRanks;
  }

  if (possibleSuits.length === 1
    && possibleRanks.length === 1) {
    identityDetermined = true;
  }

  return { suitIndex, rank, identityDetermined };
}
