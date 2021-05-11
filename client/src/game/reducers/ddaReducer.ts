import { cardRules } from "../rules";
import CardState from "../types/CardState";

export default function ddaReducer(
  deck: readonly CardState[],
  dda: number | null,
  currentPlayerIndex: number | null,
): readonly CardState[] {
  const newDeck = Array.from(deck);
  if (dda === null || currentPlayerIndex === null) {
    for (let order = 0; order < newDeck.length; order++) {
      const card = deck[order];
      newDeck[order] = {
        ...card,
        inDoubleDiscard: false,
      };
    }
  } else {
    const { suitIndex, rank } = deck[dda];
    for (let order = 0; order < newDeck.length; order++) {
      const card = deck[order];
      newDeck[order] = {
        ...card,
        inDoubleDiscard:
          card.location === currentPlayerIndex &&
          cardRules.canPossiblyBe(card, suitIndex, rank),
      };
    }
  }
  return newDeck;
}
