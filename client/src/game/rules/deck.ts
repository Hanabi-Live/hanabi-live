/* eslint-disable import/prefer-default-export */
// Functions related to deck information: total cards, drawing cards

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
