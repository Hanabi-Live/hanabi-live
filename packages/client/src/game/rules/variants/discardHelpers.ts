import type { Rank, SuitIndex, Variant } from "@hanabi/data";
import type { CardState } from "../../types/CardState";
import * as deckRules from "../deck";

export function discardedHelpers(
  variant: Variant,
  deck: readonly CardState[],
): {
  isLastCopy: (suitIndex: SuitIndex, rank: Rank) => boolean;
  isAllDiscarded: (suitIndex: SuitIndex, rank: Rank) => boolean;
} {
  // eslint-disable-next-line func-style
  const total = (suitIndex: SuitIndex, rank: Rank) => {
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
      return 0;
    }

    return deckRules.numCopiesOfCard(suit, rank, variant);
  };

  // eslint-disable-next-line func-style
  const discarded = (suitIndex: SuitIndex, rank: Rank) =>
    deckRules.discardedCopies(deck, suitIndex, rank);

  // eslint-disable-next-line func-style
  const isLastCopy = (suitIndex: SuitIndex, rank: Rank) =>
    total(suitIndex, rank) === discarded(suitIndex, rank) + 1;

  // eslint-disable-next-line func-style
  const isAllDiscarded = (suitIndex: SuitIndex, rank: Rank) =>
    total(suitIndex, rank) === discarded(suitIndex, rank);

  return { isLastCopy, isAllDiscarded };
}

export function getAllDiscardedSet(
  variant: Variant,
  deck: readonly CardState[],
  suitIndex: SuitIndex,
): Set<Rank> {
  const { isAllDiscarded } = discardedHelpers(variant, deck);

  const allDiscardedSet = new Set<Rank>();
  for (const variantRank of variant.ranks) {
    if (isAllDiscarded(suitIndex, variantRank)) {
      allDiscardedSet.add(variantRank);
    }
  }

  return allDiscardedSet;
}
