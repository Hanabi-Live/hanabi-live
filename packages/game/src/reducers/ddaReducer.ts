import { assertDefined } from "complete-common";
import type { CardState } from "../interfaces/CardState.ts";
import { canCardPossiblyBeFromCluesOnly } from "../rules/card.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";

export function ddaReducer(
  deck: readonly CardState[],
  dda: number | undefined,
  currentPlayerIndex: PlayerIndex | undefined,
): readonly CardState[] {
  if (dda === undefined || currentPlayerIndex === undefined) {
    return deck.map((card) => setInDoubleDiscard(card, false));
  }

  const ddaCard = deck[dda];
  assertDefined(ddaCard, `Failed to find the card at order: ${dda}`);

  const { suitIndex, rank } = ddaCard;

  return deck.map((card) =>
    setInDoubleDiscard(
      card,
      card.location === currentPlayerIndex
        && canCardPossiblyBeFromCluesOnly(card, suitIndex, rank),
    ),
  );
}

/** Keeps the same object for a card that does not change, so that Immer does not walk it again. */
function setInDoubleDiscard(
  card: CardState,
  inDoubleDiscard: boolean,
): CardState {
  return card.inDoubleDiscard === inDoubleDiscard
    ? card
    : {
        ...card,
        inDoubleDiscard,
      };
}
