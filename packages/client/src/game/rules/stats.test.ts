import { getDefaultVariant, getVariant } from "@hanabi/data";
import { PaceRisk } from "@hanabi/game";
import {
  cluesStillUsable,
  minEfficiency,
  pace,
  paceRisk,
  startingCluesUsable,
  startingDeckSize,
  startingPace,
} from "./stats";

const DEFAULT_VARIANT = getDefaultVariant();
const BLACK_VARIANT = getVariant("Black (6 Suits)");
const CLUE_STARVED_VARIANT = getVariant("Clue Starved (6 Suits)");
const CARDS_PER_HAND_2_PLAYER = 5;
const CARDS_PER_HAND_4_PLAYER = 4;
const CARDS_PER_HAND_2_PLAYER_ONE_EXTRA = CARDS_PER_HAND_2_PLAYER + 1;
const CARDS_PER_HAND_2_PLAYER_ONE_LESS = CARDS_PER_HAND_2_PLAYER - 1;

describe("startingPace", () => {
  test("returns 17 for 2-player No Variant", () => {
    expect(
      startingPace(
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, DEFAULT_VARIANT),
        DEFAULT_VARIANT.suits.length * 5,
        2,
      ),
    ).toBe(17);
  });

  test("returns 13 for 4-player No Variant", () => {
    expect(
      startingPace(
        startingDeckSize(4, CARDS_PER_HAND_4_PLAYER, DEFAULT_VARIANT),
        DEFAULT_VARIANT.suits.length * 5,
        4,
      ),
    ).toBe(13);
  });

  test("returns 17 for 2-player Black (6 Suits)", () => {
    expect(
      startingPace(
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, BLACK_VARIANT),
        BLACK_VARIANT.suits.length * 5,
        2,
      ),
    ).toBe(17);
  });

  test("returns 13 for 4-player Black (6 Suits)", () => {
    expect(
      startingPace(
        startingDeckSize(4, CARDS_PER_HAND_4_PLAYER, BLACK_VARIANT),
        BLACK_VARIANT.suits.length * 5,
        4,
      ),
    ).toBe(13);
  });

  test("returns 15 for 2-player No Variant with one extra card", () => {
    expect(
      startingPace(
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER_ONE_EXTRA, DEFAULT_VARIANT),
        DEFAULT_VARIANT.suits.length * 5,
        2,
      ),
    ).toBe(15);
  });

  test("returns 19 for 2-player No Variant with one less card", () => {
    expect(
      startingPace(
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER_ONE_LESS, DEFAULT_VARIANT),
        DEFAULT_VARIANT.suits.length * 5,
        2,
      ),
    ).toBe(19);
  });

  test("returns 7 for 5-player No Variant with a Contrarian character", () => {
    expect(
      startingPace(
        startingDeckSize(5, CARDS_PER_HAND_4_PLAYER, DEFAULT_VARIANT),
        DEFAULT_VARIANT.suits.length * 5,
        2,
      ),
    ).toBe(7);
  });
});

describe("minEfficiency", () => {
  test("returns about 0.86 for 2-player No Variant", () => {
    expect(
      minEfficiency(2, 2, DEFAULT_VARIANT, CARDS_PER_HAND_2_PLAYER),
    ).toBeCloseTo(0.86);
  });

  test("returns about 1 for 4-player No Variant", () => {
    expect(
      minEfficiency(4, 4, DEFAULT_VARIANT, CARDS_PER_HAND_4_PLAYER),
    ).toBeCloseTo(1);
  });

  test("returns about 1 for 2-player Black (6 Suits)", () => {
    expect(
      minEfficiency(2, 2, BLACK_VARIANT, CARDS_PER_HAND_2_PLAYER),
    ).toBeCloseTo(1);
  });

  test("returns about 1.15 for 4-player Black (6 Suits)", () => {
    expect(
      minEfficiency(4, 4, BLACK_VARIANT, CARDS_PER_HAND_4_PLAYER),
    ).toBeCloseTo(1.15);
  });

  test("returns about 1.43 for 2-player Clue Starved (6 Suits)", () => {
    expect(
      minEfficiency(2, 2, CLUE_STARVED_VARIANT, CARDS_PER_HAND_2_PLAYER),
    ).toBeCloseTo(1.43);
  });

  test("returns about 1.58 for 4-player Clue Starved (6 Suits)", () => {
    expect(
      minEfficiency(4, 4, CLUE_STARVED_VARIANT, CARDS_PER_HAND_4_PLAYER),
    ).toBeCloseTo(1.58);
  });

  test("returns about 25/19 for 5-player No Variant with a Contrarian detrimental character", () => {
    expect(
      minEfficiency(5, 2, DEFAULT_VARIANT, CARDS_PER_HAND_4_PLAYER),
    ).toBeCloseTo(25 / 19);
  });
});

describe("pace", () => {
  test("is null when deckSize is 0", () => {
    expect(pace(25, 0, 25, 4, false)).toBeNull();
  });

  test("returns +13 at the beginning of a 4-player No Variant game", () => {
    expect(pace(0, 34, 25, 4, false)).toBe(13);
  });
});

describe("paceRisk", () => {
  test("is Zero when pace is 0", () => {
    expect(paceRisk(0, 4)).toBe(PaceRisk.Zero);
  });

  test("is Low when pace is null", () => {
    expect(paceRisk(null, 4)).toBe(PaceRisk.Low);
  });
});

describe("cluesStillUsable", () => {
  test("discarding the first 5 gains a clue", () => {
    expect(
      cluesStillUsable(
        0,
        [0, 0, 0, 0, 0],
        [5, 5, 5, 5, 4],
        5,
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, DEFAULT_VARIANT) - 1,
        2,
        1,
        1,
        8,
      ),
    ).toBe(
      startingCluesUsable(
        2,
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, DEFAULT_VARIANT),
        DEFAULT_VARIANT,
      ),
    );
  });
  test("discarding the second 5 does not gain a clue", () => {
    expect(
      cluesStillUsable(
        0,
        [0, 0, 0, 0, 0],
        [5, 5, 5, 4, 4],
        5,
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, DEFAULT_VARIANT) - 2,
        2,
        1,
        1,
        8,
      ),
    ).toBe(
      startingCluesUsable(
        2,
        startingDeckSize(2, CARDS_PER_HAND_2_PLAYER, DEFAULT_VARIANT),
        DEFAULT_VARIANT,
      ) - 1,
    );
  });
  test("playing a 5 does not gain a possible clue", () => {
    expect(
      cluesStillUsable(4, [0, 0, 0, 0, 4], [5, 5, 5, 5, 5], 5, 26, 5, 1, 1, 4),
    ).toBe(17);
    expect(
      cluesStillUsable(5, [0, 0, 0, 0, 5], [5, 5, 5, 5, 5], 5, 25, 5, 1, 1, 5),
    ).toBe(17);
  });
  test("discarding a non-critical card does not gain a possible clue", () => {
    expect(
      cluesStillUsable(0, [0, 0, 0, 0, 0], [5, 5, 5, 5, 5], 5, 33, 2, 1, 1, 4),
    ).toBe(18);
    expect(
      cluesStillUsable(0, [0, 0, 0, 0, 0], [5, 5, 5, 5, 5], 5, 32, 2, 1, 1, 5),
    ).toBe(18);
  });
  test("playing the last 1 in a 4 player game loses a clue", () => {
    expect(
      cluesStillUsable(4, [1, 1, 1, 1, 0], [5, 5, 5, 5, 5], 5, 27, 4, 1, 1, 4),
    ).toBe(18);
    expect(
      cluesStillUsable(5, [1, 1, 1, 1, 1], [5, 5, 5, 5, 5], 5, 26, 4, 1, 1, 4),
    ).toBe(17);
  });
  test("finishing an imperfect suit can lose a clue", () => {
    expect(
      cluesStillUsable(15, [3, 3, 3, 3, 3], [5, 5, 5, 5, 4], 5, 17, 2, 1, 1, 4),
    ).toBe(17);
    expect(
      cluesStillUsable(16, [3, 3, 3, 3, 4], [5, 5, 5, 5, 4], 5, 16, 2, 1, 1, 4),
    ).toBe(16);
  });
  test("finishing an imperfect suit may not lose a clue", () => {
    expect(
      cluesStillUsable(15, [3, 3, 3, 3, 3], [5, 5, 5, 5, 4], 5, 16, 3, 1, 1, 4),
    ).toBe(16);
    expect(
      cluesStillUsable(16, [3, 3, 3, 3, 4], [5, 5, 5, 5, 4], 5, 15, 3, 1, 1, 4),
    ).toBe(16);
  });
  test("discards during the final round do not count", () => {
    expect(
      cluesStillUsable(24, [5, 5, 5, 5, 4], [5, 5, 5, 5, 5], 5, 1, 2, 1, 1, 4),
    ).toBe(4);
  });
});
