// Calculates the state of a card after a clue

import { getVariant } from '../data/gameData';
import CardState, { PipState } from '../types/CardState';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import Variant from '../types/Variant';
import { getIndexConverter } from './reducerHelpers';

const cardPossibilitiesReducer = (
  state: CardState,
  clue: Clue,
  positive: boolean,
  metadata: GameMetadata,
): CardState => {
  if (
    state.matchingCardsArray.length === 1
  ) {
    // We already know all details about this card, no need to calculate
    return state;
  }

  const variant = getVariant(metadata.options.variantName);

  // Apply the clue and check what is eliminated
  const clueTouch = variant.touchedCards.get(clue.value)!;
  const matchingCardsArray = state.matchingCardsArray.filter(
    ([x, y]) => clueTouch[x][y] === positive,
  );
  const matchingCards = state.matchingCards.map(
    (arr, suitIndex) => arr.map(
      (bool, rank) => bool && (clueTouch[suitIndex][rank] === positive),
    ),
  );

  const getIndex = getIndexConverter(variant);

  // Remember the clue for the future (we need that to highlight positive rank clues on pink cards)
  let colorClues = state.colorClueMemory.positiveClues;
  let rankClues = state.rankClueMemory.positiveClues;
  const valueIndex = clue.type === ClueType.Color ? getIndex(clue.value) : clue.value;
  if (positive) {
    if (clue.type === ClueType.Color && !colorClues.includes(valueIndex)) {
      colorClues = [...colorClues, valueIndex];
    } else if (clue.type === ClueType.Rank && !rankClues.includes(valueIndex)) {
      rankClues = [...rankClues, valueIndex];
    }
  }

  const { suitPips, rankPips } = checkPips(
    matchingCardsArray, state.unseenCards, variant,
  );
  const suitsPossible = suitPips
    .map((pip, i) => ((pip !== 'Hidden') ? i : -1))
    .filter((i) => i >= 0);
  const ranksPossible = rankPips
    .map((pip, i) => ((pip !== 'Hidden') ? i : -1))
    .filter((i) => i >= 0);

  const {
    suitIndex,
    rank,
    identityDetermined,
  } = updateIdentity(state, suitsPossible, ranksPossible);

  const newState: CardState = {
    ...state,
    suitIndex,
    rank,
    identityDetermined,
    rankClueMemory: {
      positiveClues: rankClues,
      possibilities: ranksPossible,
      pipStates: rankPips,
    },
    colorClueMemory: {
      positiveClues: colorClues,
      possibilities: suitsPossible,
      pipStates: suitPips,
    },
    matchingCards,
    matchingCardsArray,
  };

  return newState;
};

export default cardPossibilitiesReducer;

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

function pipStateMax(a : PipState, b : PipState) : PipState {
  if (a === 'Visible' || b === 'Visible') return 'Visible';
  if (a === 'Eliminated' || b === 'Eliminated') return 'Eliminated';
  return 'Hidden';
}

export function checkPips(
  matchingCardsArray: ReadonlyArray<readonly [number, number]>,
  unseenCards: ReadonlyArray<readonly number[]>,
  variant: Variant,
) {
  const suitPips : PipState[] = variant.suits.map(() => 'Hidden');
  const rankPips : PipState[] = [];
  for (const rank of variant.ranks) rankPips[rank] = 'Hidden';
  for (const [suitIndex, rank] of matchingCardsArray) {
    const pip = (unseenCards[suitIndex][rank] > 0) ? 'Visible' : 'Eliminated';
    suitPips[suitIndex] = pipStateMax(suitPips[suitIndex], pip);
    rankPips[rank] = pipStateMax(rankPips[rank], pip);
  }
  return { suitPips, rankPips };
}
