import { deckRules } from "../rules";
import globals from "./globals";
import HanabiCard from "./HanabiCard";

export default function getCardOrStackBase(order: number): HanabiCard {
  const card = globals.deck[order];
  if (card !== undefined) {
    return card;
  }

  // Stack bases use the orders after the final card in the deck
  const stackBaseIndex = order - deckRules.totalCards(globals.variant);
  const stackBase = globals.stackBases[stackBaseIndex];
  if (stackBase !== undefined) {
    return stackBase;
  }

  throw new Error(`Failed to find the card at order: ${order}`);
}
