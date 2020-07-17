// Touch actions for the HanabiCard object
// These are a subset of the actions in HanabiCardClick.ts

import { cardRules } from '../rules';
import HanabiCard from './HanabiCard';
import { goToTurnAndIndicateCard } from './HanabiCardClick';
import * as notes from './notes';

export function HanabiCardTap(this: HanabiCard) {
  // We must delay the action by a bit to make sure it isn't a double tap
  if (this.wasRecentlyTapped) {
    // We now know it was a double tap, so ignore the tap action
    this.wasRecentlyTapped = false;
    return;
  }
  this.wasRecentlyTapped = true;
  if (this.touchstartTimeout) {
    // We executed a tap, so prevent the code from considering a long press is happening
    clearTimeout(this.touchstartTimeout);
  }
  setTimeout(() => {
    if (this.wasRecentlyTapped) {
      HanabiCardTapAction.call(this);
    }
    this.wasRecentlyTapped = false;
  }, 500); // 500 milliseconds
}

function HanabiCardTapAction(this: HanabiCard) {
  // Disable all click events if the card is tweening
  if (this.tweening) {
    return;
  }

  if (cardRules.isPlayed(this.state)) {
    // Clicking on played cards goes to the turn immediately before they were played
    goToTurnAndIndicateCard(this.state.segmentPlayed!, this.state.order);
  } else if (cardRules.isDiscarded(this.state)) {
    // Clicking on discarded cards goes to the turn immediately before they were discarded
    goToTurnAndIndicateCard(this.state.segmentDiscarded!, this.state.order);
  }
}

export function HanabiCardDblTap(this: HanabiCard) {
  // Disable all click events if the card is tweening
  if (this.tweening) {
    return;
  }

  notes.openEditTooltip(this);
}
