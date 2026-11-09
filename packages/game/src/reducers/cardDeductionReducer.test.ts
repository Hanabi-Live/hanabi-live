import { describe, expect, test } from "bun:test";
import { getVariant } from "../gameData";
import type { CardState } from "../interfaces/CardState";
import { getDefaultMetadata } from "../metadata";
import type { CardOrder } from "../types/CardOrder";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
import type { SuitRankTuple } from "../types/SuitRankTuple";
import {
  filterCardPossibilities,
  getDeckPossibilities,
} from "./cardDeductionReducer";
import { getInitialCardState } from "./initialStates/initialCardState";

const TEAL = 0 as SuitIndex;
const RANKS = [1, 2, 3, 4, 5] as const satisfies readonly Rank[];
const ANY_TEAL: readonly SuitRankTuple[] = RANKS.map((rank) => [TEAL, rank]);

// Three 1s, two each of 2 through 4, and one 5.
const tealCounts: readonly number[][] = [[0, 3, 2, 2, 2, 1]];

describe("filterCardPossibilities", () => {
  test("rules out an identity whose copies are all needed by other cards", () => {
    const deckPossibilities: ReadonlyArray<readonly SuitRankTuple[]> = [
      [[TEAL, 5]],
      [
        [TEAL, 4],
        [TEAL, 5],
      ],
      [[TEAL, 4]],
    ];
    expect(
      filterCardPossibilities(ANY_TEAL, deckPossibilities, tealCounts),
    ).toEqual<unknown>([
      [TEAL, 1],
      [TEAL, 2],
      [TEAL, 3],
    ]);
  });

  test("finds a late conflict without trying every combination", () => {
    // Many cards that fit either of two plentiful identities, then two cards that both need the
    // only copy of a third identity. Unknown clued cards (such as those in the hole) produce
    // instances like this, which used to take an exponential search.
    const counts: readonly number[][] = [[0, 100, 100, 1]];
    const deckPossibilities: ReadonlyArray<readonly SuitRankTuple[]> = [
      ...Array.from({ length: 26 }, (): readonly SuitRankTuple[] => [
        [TEAL, 1],
        [TEAL, 2],
      ]),
      [[TEAL, 3]],
      [[TEAL, 3]],
    ];
    const start = performance.now();
    expect(
      filterCardPossibilities([[TEAL, 1]], deckPossibilities, counts),
    ).toEqual([]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("getDeckPossibilities", () => {
  test("rules out identities whose copies are all seen or deduced", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getVariant(metadata.options.variantName);
    const red = 0 as SuitIndex;
    function card(order: number): CardState {
      return getInitialCardState(order as CardOrder, variant, 2);
    }

    const discardedFive: CardState = {
      ...card(0),
      location: "discard",
      suitIndex: red,
      rank: 5,
      revealedToPlayer: [true, true],
    };
    const discardedFour: CardState = {
      ...card(1),
      location: "discard",
      suitIndex: red,
      rank: 4,
      revealedToPlayer: [true, true],
    };

    // The only other red 4 is a clued card in our own hand that only we have deduced.
    const ourRedFour: CardState = {
      ...card(2),
      location: 0,
      hasClueApplied: true,
      possibleCardsForEmpathy: [[red, 4]],
    };
    const deckCard = card(3);

    const possibilities = getDeckPossibilities(
      [discardedFive, discardedFour, ourRedFour, deckCard],
      metadata,
    );
    function isPossible(rank: Rank): boolean {
      return possibilities.some(([s, r]) => s === red && r === rank);
    }
    expect(isPossible(5)).toBe(false);
    expect(isPossible(4)).toBe(false);
    expect(isPossible(3)).toBe(true);
  });
});
