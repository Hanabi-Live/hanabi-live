import type { PlayerIndex } from "@hanabi/data";
import * as cardRules from "../rules/card";
import type { CardState } from "../types/CardState";

export function ddaReducer(
  deck: readonly CardState[],
  dda: number | null,
  currentPlayerIndex: PlayerIndex | null,
): readonly CardState[] {
  const newDeck = [...deck];

  if (dda === null || currentPlayerIndex === null) {
    for (const [order, card] of newDeck.entries()) {
      newDeck[order] = {
        ...card,
        inDoubleDiscard: false,
      };
    }

    return newDeck;
  }

  const ddaCard = deck[dda];
  if (ddaCard === undefined) {
    throw new Error(`Failed to find the card at order: ${dda}`);
  }

  const { suitIndex, rank } = ddaCard;

  for (const [order, card] of newDeck.entries()) {
    newDeck[order] = {
      ...card,
      inDoubleDiscard:
        card.location === currentPlayerIndex &&
        cardRules.canPossiblyBeFromCluesOnly(card, suitIndex, rank),
    };
  }

  return newDeck;
}
