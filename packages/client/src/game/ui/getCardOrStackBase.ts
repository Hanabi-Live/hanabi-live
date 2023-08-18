import * as deckRules from "../rules/deck";
import { globals } from "./globals";
import type { HanabiCard } from "./HanabiCard";

export function getCardOrStackBase(order: number): HanabiCard | undefined {
  const card = globals.deck[order];
  if (card !== undefined) {
    return card;
  }

  // Stack bases use the orders after the final card in the deck.
  const stackBaseIndex = order - deckRules.totalCards(globals.variant);
  const stackBase = globals.stackBases[stackBaseIndex];
  if (stackBase !== undefined) {
    return stackBase;
  }

  return undefined;
}
