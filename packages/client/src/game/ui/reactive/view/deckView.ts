import { globals } from "../../globals";

export function onCardsRemainingChanged(cardsRemainingInTheDeck: number): void {
  // Update the deck label.
  globals.elements.deck?.setCount(cardsRemainingInTheDeck);

  // Hide the question mark icon on the deck if there are 0 cards left in the deck (because it
  // interferes with the "Turns left" text).
  globals.elements.gameInfoImage?.visible(cardsRemainingInTheDeck > 0);
  globals.layers.arrow.batchDraw();

  // If we dragged the deck to the play stacks, then it will remain there until it is explicitly
  // reset.
  globals.elements.deck?.resetCardBack();
}
