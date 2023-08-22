import type { CardOrder } from "@hanabi/data";
import * as deckRules from "../rules/deck";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";

export function getCardOrStackBase(order: CardOrder): HanabiCard | undefined {
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
