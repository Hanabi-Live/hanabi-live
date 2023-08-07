import type { Variant } from "@hanabi/data";
import type { CardState } from "../../types/CardState";
import * as deckRules from "../deck";

export function discardedHelpers(
  variant: Variant,
  deck: readonly CardState[],
): {
  isLastCopy: (s: number, r: number) => boolean;
  isAllDiscarded: (s: number, r: number) => boolean;
} {
  // eslint-disable-next-line func-style
  const total = (s: number, r: number) =>
    deckRules.numCopiesOfCard(variant.suits[s]!, r, variant);

  // eslint-disable-next-line func-style
  const discarded = (s: number, r: number) =>
    deckRules.discardedCopies(deck, s, r);

  // eslint-disable-next-line func-style
  const isLastCopy = (s: number, r: number) =>
    total(s, r) === discarded(s, r) + 1;

  // eslint-disable-next-line func-style
  const isAllDiscarded = (s: number, r: number) =>
    total(s, r) === discarded(s, r);

  return { isLastCopy, isAllDiscarded };
}

export function createAllDiscardedMap(
  variant: Variant,
  deck: readonly CardState[],
  suitIndex: number,
): Map<number, boolean> {
  const { isAllDiscarded } = discardedHelpers(variant, deck);
  const allDiscarded = new Map<number, boolean>();
  for (const variantRank of variant.ranks.slice()) {
    allDiscarded.set(variantRank, isAllDiscarded(suitIndex, variantRank));
  }
  return allDiscarded;
}
