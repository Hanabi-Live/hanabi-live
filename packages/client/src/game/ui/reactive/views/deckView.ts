import { globals } from "../../UIGlobals";
import { CARD_ANIMATION_LENGTH_SECONDS } from "../../constants";
import {
  startEmptyDeckAnimation,
  stopEmptyDeckAnimation,
} from "../../signalAnimations";

export function onCardsRemainingChanged(
  cardsRemainingInTheDeck: number,
  previousCardsRemaining: number | undefined,
): void {
  stopEmptyDeckAnimation();
  // Update the deck label.
  globals.elements.deck?.setCount(cardsRemainingInTheDeck);

  // Hide the question mark icon on the deck if there are 0 cards left in the deck (because it
  // interferes with the "Turns left" text).
  globals.elements.gameInfoImage?.visible(cardsRemainingInTheDeck > 0);
  globals.layers.arrow.batchDraw();

  // If we dragged the deck to the play stacks, then it will remain there until it is explicitly
  // reset.
  globals.elements.deck?.resetCardBack();

  // Show when the last card leaves the deck, since each player then has one turn left.
  if (
    cardsRemainingInTheDeck === 0
    && previousCardsRemaining === 1
    && !globals.animateFast
  ) {
    startEmptyDeckAnimation(CARD_ANIMATION_LENGTH_SECONDS);
  }
}
