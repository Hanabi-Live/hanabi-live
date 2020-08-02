// Helper functions for doing actions to our own hand

import globals from './globals';

export const get = () => {
  if (!globals.state.playing) {
    throw new Error('Failed to get our hand because we are not currently playing.');
  }

  const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  return ourHand;
};

export const checkSetDraggableAll = () => {
  if (!globals.state.playing) {
    return;
  }

  const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(`Failed to get our hand with an index of ${ourPlayerIndex}.`);
  }
  ourHand.checkSetDraggableAll();
};
