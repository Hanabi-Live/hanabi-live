import type { CardOrder } from "@hanabi/data";
import { assertDefined } from "@hanabi/utils";
import * as deckRules from "../rules/deck";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";

export function getCardOrStackBase(order: CardOrder): HanabiCard {
  const numTotalCards = deckRules.totalCards(globals.variant);
  if (order < numTotalCards) {
    const card = globals.deck[order];
    assertDefined(card, `Failed to get card of order ${order} from the deck.`);
    if (card.isStackBase) {
      throw Error("Unexpected card marked stackBase found in globals.deck.");
    }
    return card;
  }

  // Stack bases use the orders after the final card in the deck.
  const stackBaseIndex = order - numTotalCards;
  const stackBase = globals.stackBases[stackBaseIndex];
  assertDefined(
    stackBase,
    `Failed to get stack base of index ${stackBaseIndex}`,
  );
  if (!stackBase.isStackBase) {
    throw Error(
      "Unexpected card not marked stackBase found in globals.stackBases.",
    );
  }

  return stackBase;
}
