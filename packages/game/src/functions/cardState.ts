// Helper functions relating to the `CardState` interface.

import type { CardState } from "../interfaces/CardState";

export function isCardClued(cardState: CardState): boolean {
  return cardState.numPositiveClues > 0;
}

export function isCardPlayed(cardState: CardState): boolean {
  return cardState.location === "playStack";
}

export function isCardDiscarded(cardState: CardState): boolean {
  return cardState.location === "discard";
}

export function isCardInPlayerHand(cardState: CardState): boolean {
  return typeof cardState.location === "number";
}
