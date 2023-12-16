import type { CardOrder } from "@hanabi/data";
import { getTotalCardsInDeck } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";

export function getCardOrStackBase(order: CardOrder): HanabiCard | undefined {
  const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
  if (order < totalCardsInDeck) {
    const card = globals.deck[order];
    assertDefined(card, `Failed to get card of order ${order} from the deck.`);
    if (card.isStackBase) {
      throw new Error(
        "Unexpected card marked stackBase found in globals.deck.",
      );
    }
    return card;
  }

  // Stack bases use the orders after the final card in the deck.
  const stackBaseIndex = order - totalCardsInDeck;
  const stackBase = globals.stackBases[stackBaseIndex];
  assertDefined(
    stackBase,
    `Failed to get stack base of index ${stackBaseIndex}`,
  );
  if (!stackBase.isStackBase) {
    throw new Error(
      "Unexpected card not marked stackBase found in globals.stackBases.",
    );
  }

  return stackBase;
}
