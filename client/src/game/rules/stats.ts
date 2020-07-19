// Functions to calculate game stats such as pace and efficiency

import {
  deckRules,
  handRules,
  variantRules,
  cardRules,
} from '../rules';
import CardState from '../types/CardState';
import { MAX_CLUE_NUM } from '../types/constants';
import { PaceRisk } from '../types/GameState';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';
import * as reversibleRules from './variants/reversible';

export const getMaxScore = (
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): number => {
  let maxScore = 0;

  // Getting the maximum score is much more complicated if we are playing a
  // "Reversed" or "Up or Down" variant
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.getMaxScore(deck, playStackDirections, variant);
  }

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    const suit = variant.suits[suitIndex];
    for (let rank = 1; rank <= 5; rank++) {
      // Search through the deck to see if all the copies of this card are discarded already
      const total = deckRules.numCopiesOfCard(suit, rank, variant);
      const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
      if (total > discarded) {
        maxScore += 1;
      } else {
        break;
      }
    }
  }

  return maxScore;
};

// Pace is the number of discards that can happen while still getting the maximum score
export const pace = (
  score: number,
  deckSize: number,
  maxScore: number,
  numPlayers: number,
  gameOver: boolean,
): number | null => {
  if (gameOver) {
    return null;
  }

  if (deckSize <= 0) {
    return null;
  }

  // The formula for pace was derived by Libster
  const adjustedScorePlusDeck = score + deckSize - maxScore;
  return adjustedScorePlusDeck + numPlayers;
};

// A measure of how risky a discard would be right now, using different heuristics
export const paceRisk = (currentPace: number | null, numPlayers: number): PaceRisk => {
  if (currentPace === null) {
    return 'Null';
  }

  if (currentPace <= 0) {
    return 'Zero';
  }

  // Formula derived by Florrat;
  // a strategical estimate of "End-Game" that tries to account for the number of players
  if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
    return 'HighRisk';
  }

  // Formula derived by Hyphen-ated;
  // a more conservative estimate of "End-Game" that does not account for the number of players
  if (currentPace - numPlayers < 0) {
    return 'MediumRisk';
  }

  return 'LowRisk';
};

// Calculate the starting pace with the following formula:
//   total cards in the deck -
//   ((number of cards in a player's hand - 1) * number of players) -
//   (5 * number of suits)
// https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
export const startingPace = (
  numPlayers: number,
  cardsPerHand: number,
  variant: Variant,
): number => {
  const totalCards = deckRules.totalCards(variant);
  const middleTerm = (cardsPerHand - 1) * numPlayers;
  const totalCardsToBePlayed = 5 * variant.suits.length;
  return totalCards - middleTerm - totalCardsToBePlayed;
};

export const efficiency = (cardsGotten: number, potentialCluesLost: number): number => {
  // First, handle the case where no clues have been given yet
  // Infinity is normal and expected in this case (on e.g. the first turn of the game)
  // We must explicitly check for this because while e.g. "1 / 0" in JavaScript is infinity,
  // "0 / 0" in JavaScript is NaN
  if (potentialCluesLost === 0) {
    return Infinity;
  }

  return cardsGotten / potentialCluesLost;
};

// Calculate the minimum amount of efficiency needed in order to win this variant
export const minEfficiency = (
  numPlayers: number,
  variant: Variant,
  oneExtraCard: boolean,
  oneLessCard: boolean,
): number => {
  // First, calculate the starting pace:
  const cardsPerHand = handRules.cardsPerHand(numPlayers, oneExtraCard, oneLessCard);
  const initialPace = startingPace(numPlayers, cardsPerHand, variant);

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:
  //   (5 * number of suits) /
  //   (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
  // https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
  const numSuits = variant.suits.length;
  const minEfficiencyNumerator = 5 * numSuits;
  let cluesGainedAfterCompletingSuits = numSuits;
  if (variantRules.isThrowItInAHole(variant)) {
    // Players do not gain a clue after playing a 5 in this variant
    cluesGainedAfterCompletingSuits = 0;
  }
  let unusableClues = 1;
  if (numPlayers >= 5) {
    unusableClues = 2;
  }
  if (variantRules.isThrowItInAHole(variant)) {
    // Players do not gain a clue after playing a 5 in this variant
    unusableClues = 0;
  }
  let discardsPerClue = 1;
  if (variantRules.isClueStarved(variant)) {
    discardsPerClue = 2;
  }
  const minEfficiencyDenominator = MAX_CLUE_NUM + Math.floor(
    (initialPace + cluesGainedAfterCompletingSuits - unusableClues) / discardsPerClue,
  );

  return minEfficiencyNumerator / minEfficiencyDenominator;
};

// After a discard, it is a "double discard situation" if there is only one other copy of this card
// and it needs to be played
export const doubleDiscard = (
  order: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
  const card = deck[order];
  if (card.suitIndex === null || card.rank === null) {
    if (variantRules.isThrowItInAHole(variant)) {
      // In "Throw It In A Hole", it's expected to get scrubbed discards
      return false;
    }
    throw new Error(`Unable to find the information for card ${order} in the state deck.`);
  }
  const suit = variant.suits[card.suitIndex];
  const total = deckRules.numCopiesOfCard(suit, card.rank, variant);
  const discarded = deckRules.discardedCopies(deck, card.suitIndex, card.rank);
  const needsToBePlayed = cardRules.needsToBePlayed(
    card.suitIndex,
    card.rank,
    deck,
    playStacks,
    playStackDirections,
    variant,
  );

  return total === discarded + 1 && needsToBePlayed;
};
