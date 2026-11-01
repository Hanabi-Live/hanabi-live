import { getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import type { BestScore } from "./interfaces/BestScore";
import type { UserStatsRow } from "./interfaces/UserStatsRow";
import type { SharedMissingScoresRow } from "./sharedMissingScores";
import {
  calculateEfficiency,
  getSharedMissingScoresRows,
  isBetterThan,
  parseCommaSeparated,
  parseFloatStrict,
  variantNameMatchesAny,
} from "./sharedMissingScores";

const NO_FILTERS = {
  excludedVariants: [],
  minEfficiency: undefined,
  maxEfficiency: undefined,
} as const;

/** Creates the stats of a player that has played one variant, with the same score in every mode. */
function stats(
  variantName: string,
  score: number,
  modifier = 0,
): ReadonlyMap<number, UserStatsRow> {
  const bestScores: BestScore[] = [2, 3, 4, 5, 6].map((numPlayers) => ({
    numPlayers,
    score,
    modifier,
  }));
  return new Map([
    [
      getVariant(variantName).id,
      { numGames: 1, bestScores, averageScore: score, numStrikeouts: 0 },
    ],
  ]);
}

function findRow(rows: readonly SharedMissingScoresRow[], variantName: string) {
  return rows.find((row) => row.name === variantName);
}

describe("parseCommaSeparated", () => {
  test.each([
    [undefined, []],
    ["", []],
    ["Alice", ["alice"]],
    ["Alice,Bob", ["alice", "bob"]],
    [" Alice , Bob ", ["alice", "bob"]],
    [",Alice,, ,", ["alice"]],
    ["Up or Down", ["up or down"]],
    ["\u{C0}lice", ["alice"]],
  ])("%j", (value: string | undefined, expected: readonly string[]) => {
    expect(parseCommaSeparated(value)).toEqual(expected);
  });
});

describe("variantNameMatchesAny", () => {
  test("matches any part of the name, ignoring case", () => {
    expect(variantNameMatchesAny("Rainbow (3 Suits)", ["rainbow"])).toBe(true);
    expect(variantNameMatchesAny("Rainbow (3 Suits)", ["(3 suits)"])).toBe(
      true,
    );
    expect(variantNameMatchesAny("Dark Omni (6 Suits)", ["omni"])).toBe(true);
  });

  test("matches one variant when the term is specific", () => {
    expect(
      variantNameMatchesAny("Rainbow (3 Suits)", ["rainbow (3 suits)"]),
    ).toBe(true);
    expect(
      variantNameMatchesAny("Rainbow (4 Suits)", ["rainbow (3 suits)"]),
    ).toBe(false);
  });

  test("does not match with no terms or no match", () => {
    expect(variantNameMatchesAny("Rainbow (3 Suits)", [])).toBe(false);
    expect(variantNameMatchesAny("No Variant", ["rainbow", "duck"])).toBe(
      false,
    );
  });

  test("matches if any term matches", () => {
    expect(variantNameMatchesAny("Duck (5 Suits)", ["rainbow", "duck"])).toBe(
      true,
    );
  });
});

describe("parseFloatStrict", () => {
  test.each([
    ["1", 1],
    ["1.5", 1.5],
    [" 1.5 ", 1.5],
    [".5", 0.5],
    ["1.", 1],
    ["+1", 1],
    ["1e2", 100],
    ["0", 0],
  ])("accepts %j", (value, expected) => {
    expect(parseFloatStrict(value)).toBe(expected);
  });

  test.each(["", "abc", "1.2.3", "1,5", "--1", "1e", "0x10", "NaN"])(
    "rejects %j",
    (value) => {
      expect(parseFloatStrict(value)).toBeUndefined();
    },
  );
});

function createBestScore(value: number, modifier: number): BestScore {
  return { numPlayers: 3, score: value, modifier };
}

describe("isBetterThan", () => {
  test("a higher score is better regardless of modifiers", () => {
    expect(isBetterThan(createBestScore(21, 4), createBestScore(20, 0))).toBe(
      true,
    );
    expect(isBetterThan(createBestScore(20, 0), createBestScore(21, 4))).toBe(
      false,
    );
  });

  test("with an equal score, fewer modifiers is better", () => {
    expect(isBetterThan(createBestScore(20, 1), createBestScore(20, 4))).toBe(
      true,
    );
    expect(isBetterThan(createBestScore(20, 4), createBestScore(20, 1))).toBe(
      false,
    );
  });

  test("an identical score is not better", () => {
    expect(isBetterThan(createBestScore(20, 1), createBestScore(20, 1))).toBe(
      false,
    );
  });
});

describe("calculateEfficiency", () => {
  // The expected values are the ones shown by the Golang server.
  test.each([
    ["No Variant", 2, "0.86"],
    ["No Variant", 3, "1.00"],
    ["No Variant", 5, "1.19"],
    ["No Variant", 6, "1.04"],
    ["6 Suits", 3, "0.97"],
    ["6 Suits", 5, "1.11"],
    ["Black (5 Suits)", 2, "1.04"],
    ["Black (5 Suits)", 3, "1.25"],
    ["Black (5 Suits)", 5, "1.56"],
    ["Black (5 Suits)", 6, "1.32"],
    ["Clue Starved (6 Suits)", 2, "1.43"],
    ["Clue Starved (6 Suits)", 5, "1.76"],
    ["Throw It in a Hole (5 Suits)", 2, "1.00"],
    ["Throw It in a Hole (5 Suits)", 5, "1.39"],
    ["Up or Down (5 Suits)", 3, "1.25"],
  ])("%s with %i players is %s", (variantName, numPlayers, expected) => {
    expect(
      calculateEfficiency(numPlayers, getVariant(variantName)).toFixed(2),
    ).toBe(expected);
  });
});

describe("getSharedMissingScoresRows", () => {
  test("uses the best score from any player", () => {
    const rows = getSharedMissingScoresRows(
      3,
      [stats("Black (5 Suits)", 18), stats("Black (5 Suits)", 22)],
      NO_FILTERS,
    );
    expect(findRow(rows, "Black (5 Suits)")?.score).toBe(22);
  });

  test("a variant with a perfect score from any player is not missing", () => {
    const rows = getSharedMissingScoresRows(
      3,
      [stats("Black (5 Suits)", 18), stats("Black (5 Suits)", 25)],
      NO_FILTERS,
    );
    expect(findRow(rows, "Black (5 Suits)")).toBeUndefined();
  });

  test("a perfect score with a modifier is still missing", () => {
    const rows = getSharedMissingScoresRows(
      3,
      [stats("Black (5 Suits)", 25, 1)],
      NO_FILTERS,
    );
    expect(findRow(rows, "Black (5 Suits)")).toMatchObject({
      score: 25,
      maxScore: 25,
      modifier: 1,
    });
  });

  test("with an equal score, the lowest modifier wins", () => {
    const rows = getSharedMissingScoresRows(
      3,
      [
        stats("Black (5 Suits)", 18, 2),
        stats("Black (5 Suits)", 18, 1),
        stats("Black (5 Suits)", 18, 3),
      ],
      NO_FILTERS,
    );
    expect(findRow(rows, "Black (5 Suits)")?.modifier).toBe(1);
  });

  test("a variant that nobody has played is missing with a score of 0", () => {
    const rows = getSharedMissingScoresRows(
      3,
      [new Map(), new Map()],
      NO_FILTERS,
    );
    expect(findRow(rows, "No Variant")).toMatchObject({
      numPlayers: 3,
      score: 0,
      maxScore: 25,
      modifier: 0,
      efficiency: "1.00",
      efficiencyClass: "normal",
    });
  });

  test("only reports the requested number of players", () => {
    const rows = getSharedMissingScoresRows(5, [new Map()], NO_FILTERS);
    expect(rows.every((row) => row.numPlayers === 5)).toBe(true);
  });

  test("excludes variants by partial name", () => {
    const rows = getSharedMissingScoresRows(3, [new Map()], {
      ...NO_FILTERS,
      excludedVariants: ["rainbow (3 suits)", "pink"],
    });
    expect(findRow(rows, "Rainbow (3 Suits)")).toBeUndefined();
    expect(findRow(rows, "Rainbow (4 Suits)")).toBeDefined();
    expect(findRow(rows, "Pink (3 Suits)")).toBeUndefined();
    expect(findRow(rows, "Pink (5 Suits)")).toBeUndefined();
    expect(findRow(rows, "No Variant")).toBeDefined();
  });

  test("filters by the efficiency that is shown on the page", () => {
    // "No Variant" has an efficiency of 1.00 with 3 players, so the bounds are inclusive.
    const all = getSharedMissingScoresRows(3, [new Map()], NO_FILTERS);
    const atLeast = getSharedMissingScoresRows(3, [new Map()], {
      ...NO_FILTERS,
      minEfficiency: 1,
    });
    const atMost = getSharedMissingScoresRows(3, [new Map()], {
      ...NO_FILTERS,
      maxEfficiency: 1,
    });
    expect(findRow(atLeast, "No Variant")).toBeDefined();
    expect(findRow(atMost, "No Variant")).toBeDefined();
    expect(atLeast.every((row) => Number(row.efficiency) >= 1)).toBe(true);
    expect(atMost.every((row) => Number(row.efficiency) <= 1)).toBe(true);
    expect(atLeast.length + atMost.length).toBeGreaterThan(all.length);
  });

  test("returns nothing when the efficiency range is empty", () => {
    const rows = getSharedMissingScoresRows(3, [new Map()], {
      ...NO_FILTERS,
      minEfficiency: 5,
      maxEfficiency: 6,
    });
    expect(rows).toEqual([]);
  });

  test("colors the efficiency by difficulty", () => {
    const rows = getSharedMissingScoresRows(5, [new Map()], NO_FILTERS);
    for (const row of rows) {
      const efficiency = Number(row.efficiency);
      if (efficiency >= 1.54) {
        expect(row.efficiencyClass).toBe("very-hard");
      } else if (efficiency < 1.32) {
        expect(row.efficiencyClass).toBe("normal");
      }
    }
    expect(
      new Set(rows.map((row) => row.efficiencyClass)).size,
    ).toBeGreaterThan(1);
  });
});
