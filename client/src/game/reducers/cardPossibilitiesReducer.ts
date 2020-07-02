// Calculates the state of a card after a clue

import produce, { Draft, original, castDraft } from 'immer';
import {
  removePossibilities, checkAllPipPossibilities, applyColorClue, applyRankClue,
} from '../rules/applyClueCore';
import * as variantRules from '../rules/variant';
import CardState, { PipState } from '../types/CardState';
import Clue, { rankClue, colorClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import { getVariant, getIndexConverter } from './reducerHelpers';

const cardPossibilitiesReducer = produce((
  state: Draft<CardState>,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
) => {
  if (
    state.colorClueMemory.possibilities.length === 1
    && state.rankClueMemory.possibilities.length === 1
  ) {
    // We already know all details about this card, no need to calculate
    return;
  }

  const variant = getVariant(metadata);

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

  if (positive && !memory.positiveClues.includes(valueIndex)) {
    memory.positiveClues.push(valueIndex);
  }

  if (!positive && !memory.negativeClues.includes(valueIndex)) {
    memory.negativeClues.push(valueIndex);
  }

  let suitsPossible: boolean[] | null = null;
  let ranksPossible: boolean[] | null = null;
  let possibleCards = original(state.possibleCards)!;

  if (calculatePossibilities) {
    // Now that this card has been given a clue and we have more information,
    // eliminate card possibilities that are now impossible
    for (const suitRemoved of suitsRemoved) {
      for (const rank of variant.ranks) {
        impossibleCards.push({ suit: suitRemoved, rank });
      }
    }
    for (const rankRemoved of ranksRemoved) {
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        impossibleCards.push({ suit: suitIndex, rank: rankRemoved });
      }
    }

    // Remove all the possibilities we found
    const possibilitiesToRemove = impossibleCards.map((c) => ({
      suitIndex: c.suit,
      rank: c.rank,
      all: true,
    }));
    possibleCards = removePossibilities(possibleCards, possibilitiesToRemove);

    const pipPossibilities = checkAllPipPossibilities(possibleCards, variant);
    suitsPossible = pipPossibilities.suitsPossible;
    ranksPossible = pipPossibilities.ranksPossible;

    state.possibleCards = castDraft(possibleCards);
  }

  // Bring the result back to the state
  state.rankClueMemory.possibilities = original(state.rankClueMemory.possibilities)!
    .filter((r) => !ranksRemoved.includes(r));

  state.colorClueMemory.possibilities = original(state.colorClueMemory.possibilities)!
    .filter((r) => !suitsRemoved.includes(r));

  // Use the calculated information to hide/eliminate pips
  updatePipStates(
    state.colorClueMemory.pipStates,
    suitsRemoved,
    suitsPossible,
  );
  updatePipStates(
    state.rankClueMemory.pipStates,
    ranksRemoved,
    ranksPossible,
  );

  updateIdentity(state);

  // Reapply rank clues if we removed a special suit
  const shouldReapplyRankClues = calculatePossibilities
    && suitsRemoved
      .map((i) => variant.suits[i])
      .some((s) => s.allClueRanks || s.noClueRanks);

  if (shouldReapplyRankClues) {
    state = reapplyClues(state, ClueType.Rank, metadata);
  }

  // Reapply suit clues if we removed the special rank
  const shouldReapplyColorClues = calculatePossibilities
    && (variant.specialAllClueColors || variant.specialNoClueColors)
    && ranksRemoved.some((r) => r === variant.specialRank);

  if (shouldReapplyColorClues) {
    state = reapplyClues(state, ClueType.Color, metadata);
  }
}, {} as CardState);

export default cardPossibilitiesReducer;

function reapplyClues(state: Draft<CardState>, clueType: ClueType, metadata: GameMetadata) {
  const isColorType = clueType === ClueType.Color;
  const colors = isColorType ? getVariant(metadata).clueColors : null;

  const memory = isColorType ? state.colorClueMemory : state.rankClueMemory;
  const { positiveClues, negativeClues } = memory;
  memory.positiveClues = [];
  memory.negativeClues = [];

  // Recurse
  for (const clueValue of positiveClues) {
    const value = isColorType ? colorClue(colors![clueValue]) : rankClue(clueValue);
    state = cardPossibilitiesReducer(state, value, true, metadata);
  }
  for (const clueValue of negativeClues) {
    const value = isColorType ? colorClue(colors![clueValue]) : rankClue(clueValue);
    state = cardPossibilitiesReducer(state, value, false, metadata);
  }

  return state;
}

function updatePipStates(
  pipStates: PipState[],
  pipsRemoved: number[],
  pipsPossible: boolean[] | null,
) {
  for (const i of pipsRemoved) {
    // Hide the removed pips
    pipStates[i] = 'Hidden';
  }
  if (pipsPossible !== null) {
    // Mark pips that are not hidden but not possible as eliminated
    pipStates = pipStates.map((pip, i) => (!pipsPossible[i] && pip !== 'Hidden' ? 'Eliminated' : pip));
  }
}

// Based on the current possibilities, updates the known identity of this card
function updateIdentity(state: Draft<CardState>) {
  if (state.colorClueMemory.possibilities.length === 1) {
    // We have discovered the true suit of the card
    [state.suitIndex] = state.colorClueMemory.possibilities;
  }

  if (state.rankClueMemory.possibilities.length === 1) {
    // We have discovered the true rank of the card
    [state.rank] = state.rankClueMemory.possibilities;
  }

  if (state.colorClueMemory.possibilities.length === 1
    && state.rankClueMemory.possibilities.length === 1) {
    state.identityDetermined = true;
  }
}
