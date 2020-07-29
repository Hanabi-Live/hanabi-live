// Helper functions for doing actions to our own hand

import globals from './globals';

export const get = () => {
  const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  return ourHand;
};

export const checkSetDraggableAll = () => {
  const ourPlayerIndex = globals.store!.getState().metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  ourHand.checkSetDraggableAll();
};
