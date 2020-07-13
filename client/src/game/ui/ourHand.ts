// Helper functions for doing actions to our own hand
/* eslint-disable import/prefer-default-export */

import globals from './globals';

export function get() {
  const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  return ourHand;
}

export function checkSetDraggableAll() {
  const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  ourHand.checkSetDraggableAll();
}
