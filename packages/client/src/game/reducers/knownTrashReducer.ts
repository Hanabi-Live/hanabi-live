import type { Variant } from "@hanabi/data";
import * as cardRules from "../rules/card";
import type { CardState } from "../types/CardState";
import type { GameState } from "../types/GameState";

export function knownTrashReducer(
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): readonly CardState[] {
  const newDeck = [...deck];

  for (const [order, card] of newDeck.entries()) {
    newDeck[order] = {
      ...card,
      isKnownTrashFromEmpathy: cardRules.allPossibilitiesTrash(
        card,
        deck,
        playStacks,
        playStackDirections,
        playStackStarts,
        variant,
        true,
      ),
    };
  }

  return newDeck;
}
