import { describe, expect, test } from "bun:test";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
import type { SuitRankTuple } from "../types/SuitRankTuple";
import { filterCardPossibilities } from "./cardDeductionReducer";

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
