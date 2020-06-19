/* eslint-disable import/prefer-default-export */
// Functions to calculate game stats such as pace and efficiency

import { MAX_CLUE_NUM } from '../types/constants';
import { PaceRisk } from '../types/State';
import Variant from '../types/Variant';
import * as deck from './deck';
import * as hand from './hand';
import * as variantRules from './variant';

// Formula derived by Libster;
// the number of discards that can happen while still getting the maximum score
// (this is represented to the user as "Pace" on the user interface)
export function pace(
  score: number,
  deckSize: number,
  maxScore: number,
  playerCount: number,
): number {
  const adjustedScorePlusDeck = score + deckSize - maxScore;
  return adjustedScorePlusDeck + playerCount;
}

// A measure of how risky a discard would be right now, using different heuristics
export function paceRisk(currentPace: number, playerCount: number): PaceRisk {
  if (currentPace <= 0) {
    return 'Zero';
  }

  // Formula derived by Florrat;
  // a strategical estimate of "End-Game" that tries to account for the number of players
  if (currentPace - playerCount + Math.floor(playerCount / 2) < 0) {
    return 'HighRisk';
  }

  // Formula derived by Hyphen-ated;
  // a more conservative estimate of "End-Game" that does not account for
  // the number of players
  if (currentPace - playerCount < 0) {
    return 'MediumRisk';
  }

  return 'LowRisk';
}

// Calculate the starting pace with the following formula:
//   total cards in the deck -
//   ((number of cards in a player's hand - 1) * number of players) -
//   (5 * number of suits)
// https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
export function startingPace(variant: Variant, playerCount: number): number {
  let p = deck.totalCards(variant);
  p -= (hand.cardsPerHand(playerCount) - 1) * playerCount;
  p -= 5 * variant.suits.length;
  return p;
}

export function efficiency(cardsGotten: number, potentialCluesLost: number): number {
  if (potentialCluesLost <= 0) {
    return 0;
  }
  return cardsGotten / potentialCluesLost;
}

// Calculate the minimum amount of efficiency needed in order to win this variant
export function minEfficiency(variant: Variant, playerCount: number): number {
  // First, calculate the starting pace:
  const initialPace = startingPace(variant, playerCount);

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
  if (playerCount >= 5) {
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
