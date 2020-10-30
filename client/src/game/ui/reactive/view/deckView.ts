/* eslint-disable import/prefer-default-export */

import globals from "../../globals";

export function onCardsRemainingChanged(cardsRemainingInTheDeck: number): void {
  // Update the deck label
  globals.elements.deck?.setCount(cardsRemainingInTheDeck);

  // If we dragged the deck to the play stacks,
  // then it will remain there until it is explicitly reset
  globals.elements.deck?.resetCardBack();
}
