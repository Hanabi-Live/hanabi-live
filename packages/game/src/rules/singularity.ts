import type { CardState } from "../interfaces/CardState";
import type { Variant } from "../interfaces/Variant";
import type { CardOrder } from "../types/CardOrder";
import type { Clue } from "../types/Clue";
import type { SuitRankTuple } from "../types/SuitRankTuple";
import { isCardTouchedByClue } from "./clues";

export function absorbsClue(
  variant: Variant,
  clue: Clue,
  [suitIndex, rank]: SuitRankTuple,
): boolean {
  const suit = variant.suits[suitIndex];
  return (
    suit !== undefined
    && suit.singularity
    && (suit.absorbsUnmatchedClues
      || isCardTouchedByClue(variant, clue, suitIndex, rank))
  );
}

/** Guaranteed touches for visible cards or partially specified hypothetical cards. */
export function getClueTouchedIndices(
  variant: Variant,
  clue: Clue,
  hand: ReadonlyArray<readonly SuitRankTuple[]>,
): readonly number[] {
  return hand.flatMap((possibilities, index) => {
    const alwaysAbsorbs =
      possibilities.length > 0
      && possibilities.every((identity) =>
        absorbsClue(variant, clue, identity),
      );
    const otherMightAbsorb = hand.some(
      (other, i) =>
        i !== index
        && other.some((identity) => absorbsClue(variant, clue, identity)),
    );
    const alwaysMatches = possibilities.every(([suit, rank]) =>
      isCardTouchedByClue(variant, clue, suit, rank),
    );
    return alwaysMatches && (alwaysAbsorbs || !otherMightAbsorb) ? [index] : [];
  });
}

/** A known absorber makes even an empty clue legal (Null Singularity). */
export function isClueAbsorbedByHand(
  variant: Variant,
  clue: Clue,
  hand: ReadonlyArray<readonly SuitRankTuple[]>,
): boolean {
  return hand.some(
    (possibilities) =>
      possibilities.length > 0
      && possibilities.every((identity) =>
        absorbsClue(variant, clue, identity),
      ),
  );
}

export interface ClueModes {
  readonly absorbed: boolean;
  readonly normal: boolean;
}

/**
 * The server sends only the touched cards, never whether a clue was absorbed. Test both
 * explanations using public clue knowledge, not visible identities. Possibilities are deliberately
 * conservative about card counts and correlations between earlier clues: neither explanation may
 * eliminate a true identity.
 */
export function getClueModes(
  variant: Variant,
  clue: Clue,
  hand: readonly CardOrder[],
  deck: readonly CardState[],
  touched: readonly CardOrder[],
  ignoreNegative = false,
): ClueModes {
  const absorbed =
    hand.some((order) =>
      (deck[order]?.possibleCardsFromClues ?? []).some(
        (identity) =>
          absorbsClue(variant, clue, identity)
          && (isCardTouchedByClue(variant, clue, identity[0], identity[1])
            === touched.includes(order)
            || (ignoreNegative && !touched.includes(order))),
      ),
    )
    && hand.every((order) =>
      (deck[order]?.possibleCardsFromClues ?? []).some(
        (identity) =>
          (ignoreNegative && !touched.includes(order))
          || (absorbsClue(variant, clue, identity)
            && isCardTouchedByClue(variant, clue, identity[0], identity[1]))
            === touched.includes(order),
      ),
    );
  const normal = hand.every((order) =>
    (deck[order]?.possibleCardsFromClues ?? []).some(
      ([suit, rank]) =>
        (ignoreNegative && !touched.includes(order))
        || (!absorbsClue(variant, clue, [suit, rank])
          && isCardTouchedByClue(variant, clue, suit, rank)
            === touched.includes(order)),
    ),
  );
  return { absorbed, normal };
}

export function isPossibleAfterClue(
  variant: Variant,
  clue: Clue,
  identity: SuitRankTuple,
  positive: boolean,
  modes: ClueModes,
): boolean {
  const absorbs = absorbsClue(variant, clue, identity);
  return (
    (modes.absorbed
      && (absorbs
        && isCardTouchedByClue(variant, clue, identity[0], identity[1]))
        === positive)
    || (modes.normal
      && !absorbs
      && isCardTouchedByClue(variant, clue, identity[0], identity[1])
        === positive)
  );
}
