import type { PlayerIndex } from "@hanabi/data";
import type { CardState } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";
import * as cardRules from "../rules/card";

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
    newDeck[order] = {
      ...card,
      inDoubleDiscard:
        card.location === currentPlayerIndex &&
        cardRules.canCardPossiblyBeFromCluesOnly(card, suitIndex, rank),
    };
  }

  return newDeck;
}
