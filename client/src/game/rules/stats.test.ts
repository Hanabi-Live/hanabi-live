import { getVariant } from "../data/gameData";
import { DEFAULT_VARIANT_NAME } from "../types/constants";
import {
  maxClues,
  minEfficiency,
  pace,
  paceRisk,
  startingMaxClues,
  startingPace,
} from "./stats";

const defaultVariant = getVariant(DEFAULT_VARIANT_NAME);
const blackVariant = getVariant("Black (6 Suits)");
const clueStarvedVariant = getVariant("Clue Starved (6 Suits)");
const cardsPerHand2Player = 5;
const cardsPerHand4Player = 4;
const cardsPerHand2PlayerOneExtra = cardsPerHand2Player + 1;
const cardsPerHand2PlayerOneLess = cardsPerHand2Player - 1;

describe("startingPace", () => {
  test("returns 17 for 2-player No Variant", () => {
    expect(startingPace(2, 2, cardsPerHand2Player, defaultVariant)).toBe(17);
  });

  test("returns 13 for 4-player No Variant", () => {
    expect(startingPace(4, 4, cardsPerHand4Player, defaultVariant)).toBe(13);
  });

  test("returns 17 for 2-player Black (6 Suits)", () => {
    expect(startingPace(2, 2, cardsPerHand2Player, blackVariant)).toBe(17);
  });

  test("returns 13 for 4-player Black (6 Suits)", () => {
    expect(startingPace(4, 4, cardsPerHand4Player, blackVariant)).toBe(13);
  });

  test("returns 15 for 2-player No Variant with one extra card", () => {
    expect(
      startingPace(2, 2, cardsPerHand2PlayerOneExtra, defaultVariant),
    ).toBe(15);
  });

  test("returns 19 for 2-player No Variant with one less card", () => {
    expect(startingPace(2, 2, cardsPerHand2PlayerOneLess, defaultVariant)).toBe(
      19,
    );
  });

  test("returns 7 for 5-player No Variant with a Contrarian character", () => {
    expect(startingPace(5, 2, cardsPerHand4Player, defaultVariant)).toBe(7);
  });
});

describe("minEfficiency", () => {
  test("returns about 0.86 for 2-player No Variant", () => {
    expect(
      minEfficiency(2, 2, defaultVariant, cardsPerHand2Player),
    ).toBeCloseTo(0.86);
  });

  test("returns about 1 for 4-player No Variant", () => {
    expect(
      minEfficiency(4, 4, defaultVariant, cardsPerHand4Player),
    ).toBeCloseTo(1);
  });

  test("returns about 1 for 2-player Black (6 Suits)", () => {
    expect(minEfficiency(2, 2, blackVariant, cardsPerHand2Player)).toBeCloseTo(
      1,
    );
  });

  test("returns about 1.15 for 4-player Black (6 Suits)", () => {
    expect(minEfficiency(4, 4, blackVariant, cardsPerHand4Player)).toBeCloseTo(
      1.15,
    );
  });

  test("returns about 1.43 for 2-player Clue Starved (6 Suits)", () => {
    expect(
      minEfficiency(2, 2, clueStarvedVariant, cardsPerHand2Player),
    ).toBeCloseTo(1.43);
  });

  test("returns about 1.58 for 4-player Clue Starved (6 Suits)", () => {
    expect(
      minEfficiency(4, 4, clueStarvedVariant, cardsPerHand4Player),
    ).toBeCloseTo(1.58);
  });

  test("returns about 25/19 for 5-player No Variant with a Contrarian detrimental character", () => {
    expect(
      minEfficiency(5, 2, defaultVariant, cardsPerHand4Player),
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
    expect(paceRisk(0, 4)).toBe("Zero");
  });

  test("is Null when pace is null", () => {
    expect(paceRisk(null, 4)).toBe("Null");
  });
});

describe("maxClues", () => {
  test("discarding the first 5 gains a clue", () => {
    expect(
      maxClues(
        [0, 0, 0, 0, 0],
        [5, 5, 5, 5, 4],
        startingPace(2, 2, cardsPerHand2Player, defaultVariant),
        2,
        1,
        1,
        8,
      ),
    ).toBe(
      startingMaxClues(
        2,
        startingPace(2, 2, cardsPerHand2Player, defaultVariant),
        defaultVariant,
      ),
    );
  });
  test("discarding the second 5 does not gain a clue", () => {
    expect(
      maxClues(
        [0, 0, 0, 0, 0],
        [5, 5, 5, 4, 4],
        startingPace(2, 2, cardsPerHand2Player, defaultVariant),
        2,
        1,
        1,
        8,
      ),
    ).toBe(
      startingMaxClues(
        2,
        startingPace(2, 2, cardsPerHand2Player, defaultVariant),
        defaultVariant,
      ) - 1,
    );
  });
  test("playing a 5 does not gain a possible clue", () => {
    expect(maxClues([0, 0, 0, 0, 4], [5, 5, 5, 5, 5], 10, 5, 1, 1, 4)).toBe(17);
    expect(maxClues([0, 0, 0, 0, 5], [5, 5, 5, 5, 5], 10, 5, 1, 1, 5)).toBe(17);
  });
  test("discarding a non-critical card does not gain a possible clue", () => {
    expect(maxClues([0, 0, 0, 0, 0], [5, 5, 5, 5, 5], 10, 2, 1, 1, 4)).toBe(18);
    expect(maxClues([0, 0, 0, 0, 0], [5, 5, 5, 5, 5], 9, 2, 1, 1, 5)).toBe(18);
  });
  test("playing the last 1 in a 4 player game loses a clue", () => {
    expect(maxClues([1, 1, 1, 1, 0], [5, 5, 5, 5, 5], 10, 4, 1, 1, 4)).toBe(18);
    expect(maxClues([1, 1, 1, 1, 1], [5, 5, 5, 5, 5], 10, 4, 1, 1, 4)).toBe(17);
  });
  test("finishing an imperfect suit can lose a clue", () => {
    expect(maxClues([3, 3, 3, 3, 3], [5, 5, 5, 5, 4], 10, 2, 1, 1, 4)).toBe(17);
    expect(maxClues([3, 3, 3, 3, 4], [5, 5, 5, 5, 4], 10, 2, 1, 1, 4)).toBe(16);
  });
  test("finishing an imperfect suit may not lose a clue", () => {
    expect(maxClues([3, 3, 3, 3, 3], [5, 5, 5, 5, 4], 10, 3, 1, 1, 4)).toBe(16);
    expect(maxClues([3, 3, 3, 3, 4], [5, 5, 5, 5, 4], 10, 3, 1, 1, 4)).toBe(16);
  });
});
