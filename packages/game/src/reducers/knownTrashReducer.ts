import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import { isAllCardPossibilitiesTrash } from "../rules/card";

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
