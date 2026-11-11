import { assertDefined } from "complete-common";
import type { CardState } from "../interfaces/CardState.ts";
import { canCardPossiblyBeFromCluesOnly } from "../rules/card.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";

export function ddaReducer(
  deck: readonly CardState[],
  dda: number | undefined,
  currentPlayerIndex: PlayerIndex | undefined,
): readonly CardState[] {
  const newDeck = [...deck];

  if (dda === undefined || currentPlayerIndex === undefined) {
    for (const [order, card] of newDeck.entries()) {
      newDeck[order] = {
        ...card,
        inDoubleDiscard: false,
      };
    }

    return newDeck;
  }

  const ddaCard = deck[dda];
  assertDefined(ddaCard, `Failed to find the card at order: ${dda}`);

  const { suitIndex, rank } = ddaCard;

  for (const [order, card] of newDeck.entries()) {
    const inDoubleDiscard =
      card.location === currentPlayerIndex
      && canCardPossiblyBeFromCluesOnly(card, suitIndex, rank);

    newDeck[order] = {
      ...card,
      inDoubleDiscard,
    };
  }

  return newDeck;
}
