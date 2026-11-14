// In a hypothetical that hides the drawn cards, the classic screen shows the starting player's hand
// as that player sees it.

import type { PlayerIndex } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { setEmpathyOnHand } from "./HanabiCardMouse.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";

export function changeStartingHandVisibility(): void {
  const startingPlayerIndex =
    globals.state.replay.hypothetical?.startingPlayerIndex;

  if (
    startingPlayerIndex === undefined
    || globals.elements.playerHands[startingPlayerIndex] === undefined
  ) {
    // Remove all empathy visibility, no longer in hypo.
    for (const i of eRange(globals.options.numPlayers)) {
      const playerIndex = i as PlayerIndex;
      forceHandEmpathy(playerIndex, false);
    }

    return;
  }

  forceHandEmpathy(
    startingPlayerIndex,
    !globals.state.replay.hypothetical!.showDrawnCards,
  );
}

function forceHandEmpathy(playerIndex: PlayerIndex, force: boolean) {
  const hand = globals.elements.playerHands[playerIndex];
  if (hand === undefined) {
    return;
  }

  for (const i of eRange(hand.children.length)) {
    const layoutChild = hand.children[i];
    if (layoutChild === undefined) {
      continue;
    }

    const { card } = layoutChild as unknown as LayoutChild;
    setEmpathyOnHand(card, force);
  }
}
