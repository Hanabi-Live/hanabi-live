import { Variant } from "@hanabi/data";
import * as cardRules from "../rules/card";
import { CardState } from "../types/CardState";
import { StackDirection } from "../types/StackDirection";

export function knownTrashReducer(
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): readonly CardState[] {
  const newDeck = Array.from(deck);
  for (let order = 0; order < newDeck.length; order++) {
    const card = deck[order]!;
    newDeck[order] = {
      ...card,
      isKnownTrashFromEmpathy: cardRules.allPossibilitiesTrash(
        card,
        deck,
        playStacks,
        playStackDirections,
        variant,
        true,
      ),
    };
  }
  return newDeck;
}
