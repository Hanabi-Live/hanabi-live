import type { CardState } from "../interfaces/CardState.js";
import type { GameState } from "../interfaces/GameState.js";
import type { Variant } from "../interfaces/Variant.js";
import { isAllCardPossibilitiesTrash } from "../rules/card.js";

export function knownTrashReducer(
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): readonly CardState[] {
  const newDeck = [...deck];

  for (const [order, card] of newDeck.entries()) {
    const isKnownTrashFromEmpathy = isAllCardPossibilitiesTrash(
      card,
      deck,
      playStacks,
      playStackDirections,
      playStackStarts,
      variant,
      true,
    );

    newDeck[order] = {
      ...card,
      isKnownTrashFromEmpathy,
    };
  }

  return newDeck;
}
