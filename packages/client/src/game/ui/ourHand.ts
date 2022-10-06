// Helper functions for doing actions to our own hand.

import CardLayout from "./CardLayout";
import globals from "./globals";

export function get(): CardLayout {
  if (!globals.state.playing) {
    throw new Error(
      "Failed to get our hand because we are not currently playing.",
    );
  }

  const { ourPlayerIndex } = globals.metadata;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(
      `Failed to get our hand with an index of: ${ourPlayerIndex}`,
    );
  }
  return ourHand;
}

export function checkSetDraggableAll(): void {
  if (!globals.state.playing) {
    return;
  }

  const { ourPlayerIndex } = globals.metadata;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  if (ourHand === undefined) {
    throw new Error(
      `Failed to get our hand with an index of: ${ourPlayerIndex}`,
    );
  }
  ourHand.checkSetDraggableAll();
}
