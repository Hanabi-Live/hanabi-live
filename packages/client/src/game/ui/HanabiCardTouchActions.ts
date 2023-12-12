// Touch actions for the HanabiCard object. These are a subset of the actions in HanabiCardClick.ts.

import * as cardRules from "../rules/card";
import { DOUBLE_TAP_DELAY_SECONDS } from "./constants";
import type { HanabiCard } from "./HanabiCard";
import * as notes from "./notes";
import * as replay from "./replay";

export function HanabiCardTap(this: HanabiCard): void {
  // We must delay the action by a bit to make sure it isn't a double tap.
  if (this.wasRecentlyTapped) {
    // We now know it was a double tap, so ignore the tap action.
    this.wasRecentlyTapped = false;
    return;
  }
  this.wasRecentlyTapped = true;

  if (this.touchstartTimeout !== null) {
    // We executed a tap, so prevent the code from considering a long press is happening.
    clearTimeout(this.touchstartTimeout);
  }

  setTimeout(() => {
    if (this.wasRecentlyTapped) {
      HanabiCardTapAction.call(this);
    }
    this.wasRecentlyTapped = false;
  }, DOUBLE_TAP_DELAY_SECONDS);
}

function HanabiCardTapAction(this: HanabiCard) {
  // Disable all click events if the card is tweening.
  if (this.tweening) {
    return;
  }

  if (cardRules.isCardPlayed(this.state) && this.state.segmentPlayed !== null) {
    // Tapping on played cards goes to the turn immediately before they were played.
    replay.goToSegmentAndIndicateCard(
      this.state.segmentPlayed,
      this.state.order,
    );
  } else if (
    cardRules.isCardDiscarded(this.state) &&
    this.state.segmentDiscarded !== null
  ) {
    // Tapping on discarded cards goes to the turn immediately before they were discarded.
    replay.goToSegmentAndIndicateCard(
      this.state.segmentDiscarded,
      this.state.order,
    );
  }
}

export function HanabiCardDblTap(this: HanabiCard): void {
  // Disable all click events if the card is tweening.
  if (this.tweening) {
    return;
  }

  // Open notes from mobile.
  const isDesktop = false;
  notes.openEditTooltip(this, isDesktop);
}
