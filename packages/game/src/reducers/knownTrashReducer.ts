import type { CardState } from "../interfaces/CardState.ts";
import type { GameState } from "../interfaces/GameState.ts";
import type { Variant } from "../interfaces/Variant.ts";
import { isAllCardPossibilitiesTrash } from "../rules/card.ts";

export function knownTrashReducer(
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): readonly CardState[] {
  return deck.map((card) => {
    const isKnownTrashFromEmpathy = isAllCardPossibilitiesTrash(
      card,
      deck,
      playStacks,
      playStackDirections,
      playStackStarts,
      variant,
      true,
    );

    // Keep the same object for a card that does not change, so that Immer does not walk it again.
    return card.isKnownTrashFromEmpathy === isKnownTrashFromEmpathy
      ? card
      : {
          ...card,
          isKnownTrashFromEmpathy,
        };
  });
}
