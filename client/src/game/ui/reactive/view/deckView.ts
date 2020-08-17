/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export const onCardsRemainingChanged = (cardsRemainingInTheDeck: number) => {
  // Update the deck label
  globals.elements.deck!.setCount(cardsRemainingInTheDeck);
};
