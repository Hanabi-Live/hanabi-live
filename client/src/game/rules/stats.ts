/* eslint-disable import/prefer-default-export */
// Functions to calculate game stats such as pace and efficiency

import { MAX_CLUE_NUM } from '../types/constants';
import Variant from '../types/Variant';
import * as deck from './deck';
import * as hand from './hand';

export function minEfficiency(variant: Variant, playerCount: number): number {
  // Calculate the minimum amount of efficiency needed in order to win this variant
  // First, calculate the starting pace with the following formula:
  //   total cards in the deck -
  //   ((number of cards in a player's hand - 1) * number of players) -
  //   (5 * number of suits)
  // https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md

  const totalCardsInTheDeck = deck.totalCards(variant);
  const cardsInHand = hand.cardsPerHand(playerCount);
  const numSuits = variant.suits.length;
  let startingPace = totalCardsInTheDeck;
  startingPace -= (cardsInHand - 1) * playerCount;
  startingPace -= 5 * numSuits;

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:
  //   (5 * number of suits) /
  //   (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
  // https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
  const minEfficiencyNumerator = 5 * numSuits;
  let cluesGainedAfterCompletingSuits = numSuits;
  if (variant.name.startsWith('Throw It in a Hole')) {
    // Players do not gain a clue after playing a 5 in this variant
    cluesGainedAfterCompletingSuits = 0;
  }
  let unusableClues = 1;
  if (playerCount >= 5) {
    unusableClues = 2;
  }
  if (variant.name.startsWith('Throw It in a Hole')) {
    // Players do not gain a clue after playing a 5 in this variant
    unusableClues = 0;
  }
  let discardsPerClue = 1;
  if (variant.name.startsWith('Clue Starved')) {
    discardsPerClue = 2;
  }
  const minEfficiencyDenominator = MAX_CLUE_NUM + Math.floor(
    (startingPace + cluesGainedAfterCompletingSuits - unusableClues) / discardsPerClue,
  );

  return minEfficiencyNumerator / minEfficiencyDenominator;
}
