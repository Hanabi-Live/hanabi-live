import { globals } from "../../UIGlobals.ts";
import { CARD_ANIMATION_LENGTH_SECONDS } from "../../constants.ts";
import {
  startEmptyDeckAnimation,
  stopEmptyDeckAnimation,
} from "../../signalAnimations.ts";

export function onCardsRemainingChanged(
  cardsRemainingInTheDeck: number,
  previousCardsRemaining: number | undefined,
): void {
  stopEmptyDeckAnimation();
  // Update the deck label. This also hides the question mark icon on the deck if there are 0 cards
  // left in the deck (because it interferes with the "Turns left" text).
  globals.elements.deck?.setCount(cardsRemainingInTheDeck);

  // If we dragged the deck to the play stacks, then it will remain there until it is explicitly
  // reset.
  globals.elements.deck?.resetCardBack();

  // Show when the last card leaves the deck, since each player then has one turn left. Skip this in
  // a replay.
  if (
    cardsRemainingInTheDeck === 0
    && previousCardsRemaining === 1
    && !globals.animateFast
    && !globals.state.replay.active
  ) {
    startEmptyDeckAnimation(CARD_ANIMATION_LENGTH_SECONDS);
  }
}

/** Cards that leave the deck or gain clues can change which cards can still be in the deck. */
export function onDeckChanged(): void {
  globals.elements.deck?.updateEmpathy();
}
