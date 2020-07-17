/* eslint-disable import/prefer-default-export */

import globals from '../../globals';

export const onDeckSizeChanged = (deckSize: number) => {
  // Update the deck label
  globals.deckSize = deckSize;
  globals.elements.deck!.setCount(deckSize);
};
