import type { CardState, PlayerIndex } from "@hanabi/game";
import { canCardPossiblyBeFromCluesOnly } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";

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
  assertDefined(ddaCard, `Failed to find the card at order: ${dda}`);

  const { suitIndex, rank } = ddaCard;

  for (const [order, card] of newDeck.entries()) {
    const inDoubleDiscard =
      card.location === currentPlayerIndex &&
      canCardPossiblyBeFromCluesOnly(card, suitIndex, rank);

    newDeck[order] = {
      ...card,
      inDoubleDiscard,
    };
  }

  return newDeck;
}
