// Functions to calculate game stats such as pace and efficiency

import { MAX_CLUE_NUM } from '../types/constants';
import { PaceRisk } from '../types/GameState';
import Variant from '../types/Variant';
import * as deck from './deck';
import * as hand from './hand';
import * as variantRules from './variant';

/*
export function maxScore(state: GameState): number {
  // TODO
}
*/

// Pace is the number of discards that can happen while still getting the maximum score
export function pace(
  score: number,
  deckSize: number,
  maxScore: number,
  numPlayers: number,
  gameOver: boolean,
): number | null {
  if (gameOver) {
    return null;
  }

  if (deckSize <= 0) {
    return null;
  }

  // The formula for pace was derived by Libster
  const adjustedScorePlusDeck = score + deckSize - maxScore;
  return adjustedScorePlusDeck + numPlayers;
}

// A measure of how risky a discard would be right now, using different heuristics
export function paceRisk(currentPace: number | null, numPlayers: number): PaceRisk {
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
}

// Calculate the starting pace with the following formula:
//   total cards in the deck -
//   ((number of cards in a player's hand - 1) * number of players) -
//   (5 * number of suits)
// https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
export function startingPace(
  numPlayers: number,
  cardsPerHand: number,
  variant: Variant,
): number {
  let p = deck.totalCards(variant);
  p -= (cardsPerHand - 1) * numPlayers;
  p -= 5 * variant.suits.length;
  return p;
}

export function efficiency(cardsGotten: number, potentialCluesLost: number): number {
  // First, handle the case where no clues have been given yet
  // Infinity is normal and expected in this case (on e.g. the first turn of the game)
  // We must explicitly check for this because while e.g. "1 / 0" in JavaScript is infinity,
  // "0 / 0" in JavaScript is NaN
  if (potentialCluesLost === 0) {
    return Infinity;
  }

  return cardsGotten / potentialCluesLost;
}

// Calculate the minimum amount of efficiency needed in order to win this variant
export function minEfficiency(
  numPlayers: number,
  variant: Variant,
  oneExtraCard: boolean,
  oneLessCard: boolean,
): number {
  // First, calculate the starting pace:
  const cardsPerHand = hand.cardsPerHand(numPlayers, oneExtraCard, oneLessCard);
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
}
