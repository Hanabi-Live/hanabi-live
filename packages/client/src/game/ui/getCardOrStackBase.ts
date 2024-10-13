import type { CardOrder } from "@hanabi-live/game";
import { getTotalCardsInDeck } from "@hanabi-live/game";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";

export function getCardOrStackBase(order: CardOrder): HanabiCard | undefined {
  const totalCardsInDeck = getTotalCardsInDeck(globals.variant);

  // Stack bases use the orders after the final card in the deck.
  if (order >= totalCardsInDeck) {
    const stackBaseIndex = order - totalCardsInDeck;
    const stackBase = globals.stackBases[stackBaseIndex];
    return stackBase === undefined || !stackBase.isStackBase
      ? undefined
      : stackBase;
  }

  // This is a normal card.
  const card = globals.deck[order];
  return card === undefined || card.isStackBase ? undefined : card;
}
