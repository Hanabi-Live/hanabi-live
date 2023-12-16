// Helper functions for doing actions to our own hand.

import { assertDefined } from "isaacscript-common-ts";
import type { CardLayout } from "./CardLayout";
import { globals } from "./UIGlobals";

export function get(): CardLayout {
  if (!globals.state.playing) {
    throw new Error(
      "Failed to get our hand because we are not currently playing.",
    );
  }

  const { ourPlayerIndex } = globals.metadata;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  assertDefined(
    ourHand,
    `Failed to get our hand with an index of: ${ourPlayerIndex}`,
  );

  return ourHand;
}

export function checkSetDraggableAll(): void {
  if (!globals.state.playing) {
    return;
  }

  const { ourPlayerIndex } = globals.metadata;
  const ourHand = globals.elements.playerHands[ourPlayerIndex];
  assertDefined(
    ourHand,
    `Failed to get our hand with an index of: ${ourPlayerIndex}`,
  );

  ourHand.checkSetDraggableAll();
}
