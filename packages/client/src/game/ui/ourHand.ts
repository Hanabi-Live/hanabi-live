// Helper functions for doing actions to our own hand.

import { assertDefined } from "complete-common";
import type { CardLayout } from "./CardLayout.ts";
import { globals } from "./UIGlobals.ts";

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
