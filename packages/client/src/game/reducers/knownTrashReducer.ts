import type { Rank, Variant } from "@hanabi/data";
import type { DeepReadonly } from "@hanabi/utils";
import * as cardRules from "../rules/card";
import type { CardState } from "../types/CardState";
import type { StackDirection } from "../types/StackDirection";

export function knownTrashReducer(
  deck: readonly CardState[],
  playStacks: DeepReadonly<number[][]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
): readonly CardState[] {
  const newDeck = [...deck];

  for (let order = 0; order < newDeck.length; order++) {
    const card = deck[order]!;
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
