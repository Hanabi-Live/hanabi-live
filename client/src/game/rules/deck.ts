// Functions related to deck information: total cards, drawing cards

import Suit from '../types/Suit';
import Variant from '../types/Variant';
import * as variantRules from './variant';

export function totalCards(variant: Variant) {
  let totalCardsInTheDeck = 0;
  for (const suit of variant.suits) {
    totalCardsInTheDeck += 10;
    if (suit.oneOfEach) {
      totalCardsInTheDeck -= 5;
    } else if (variantRules.isUpOrDown(variant)) {
      totalCardsInTheDeck -= 1;
    }
  }
  return totalCardsInTheDeck;
}

// Given a variant, and a card's rank and suit, returns how many copies of
// this card exist in the deck
export function numCopiesOfCard(variant: Variant, rank: number, suit: Suit) {
  // In a normal suit of Hanabi,
  // there are three 1's, two 2's, two 3's, two 4's, and one 5
  let amountToAdd = 2;
  if (rank === 1) {
    amountToAdd = 3;
    if (variantRules.isUpOrDown(variant) || suit.reversed) {
      amountToAdd = 1;
    }
  } else if (rank === 5) {
    amountToAdd = 1;
    if (suit.reversed) {
      amountToAdd = 3;
    }
  }
  if (suit.oneOfEach) {
    amountToAdd = 1;
  }
  return amountToAdd;
}
