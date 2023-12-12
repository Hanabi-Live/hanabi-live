import type { Variant } from "@hanabi/data";
import type { CardState } from "@hanabi/game";
import * as cardRules from "../rules/card";
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
      isKnownTrashFromEmpathy: cardRules.isAllCardPossibilitiesTrash(
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
