import { getDefaultVariant, getVariant, START_CARD_RANK } from "@hanabi/data";
import { iRange, newArray } from "@hanabi/utils";
import { initialCardState } from "../reducers/initialStates/initialCardState";
import { StackDirection } from "../types/StackDirection";
import { direction, nextPlayableRanks } from "./playStacks";

const DEFAULT_VARIANT = getDefaultVariant();
const UP_OR_DOWN_VARIANT = getVariant("Up or Down (6 Suits)");
const REVERSED_VARIANT = getVariant("Reversed (6 Suits)");

const defaultStackStarts = newArray(DEFAULT_VARIANT.suits.length, 1);
const defaultReverseStackStarts = newArray(DEFAULT_VARIANT.suits.length, 5);

describe("direction", () => {
  test("returns Up for No Variant, not finished", () => {
    const playStackDirection = direction(0, [], [], DEFAULT_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test("returns Down for the reversed suit", () => {
    const playStackDirection = direction(5, [], [], REVERSED_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Down);
  });

  test("returns Up for the non-reversed suits in Reversed", () => {
    const playStackDirection = direction(0, [], [], REVERSED_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test("returns Finished for No Variant, 5 cards played", () => {
    const playStackDirection = direction(
      0,
      [1, 2, 3, 4, 5],
      [],
      DEFAULT_VARIANT,
    );
    expect(playStackDirection).toBe(StackDirection.Finished);
  });

  describe("Up or Down", () => {
    // Cards for Up or Down tests.
    const redStart = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: START_CARD_RANK,
      suitIndex: 0,
    };
    const redOne = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 1,
      suitIndex: 0,
    };
    const redTwo = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 2,
      suitIndex: 0,
    };
    const redThree = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 3,
      suitIndex: 0,
    };
    const redFour = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 4,
      suitIndex: 0,
    };
    const redFive = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 5,
      suitIndex: 0,
    };

    test("returns Finished for Up or Down, 5 cards played", () => {
      const playStackDirection = direction(
        0,
        [1, 2, 3, 4, 5],
        [],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Finished);
    });

    test("returns Undecided for Up or Down, no cards played", () => {
      const playStackDirection = direction(0, [], [], UP_OR_DOWN_VARIANT);
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test("returns Undecided for Up or Down, START played", () => {
      const playStackDirection = direction(
        0,
        [0],
        [redStart],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test("returns Up for Up or Down, 1 played", () => {
      const playStackDirection = direction(
        0,
        [0],
        [redOne],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, 5 played", () => {
      const playStackDirection = direction(
        0,
        [0],
        [redFive],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Down);
    });

    test("returns Up for Up or Down, Start then 2 played", () => {
      const playStackDirection = direction(
        0,
        [0, 1],
        [redStart, redTwo],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, Start then 4 played", () => {
      const playStackDirection = direction(
        0,
        [0, 1],
        [redStart, redFour],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Down);
    });

    test("returns Up for Up or Down, Start-2-3 played", () => {
      const stackDirection = direction(
        0,
        [0, 1, 2],
        [redStart, redTwo, redThree],
        UP_OR_DOWN_VARIANT,
      );
      expect(stackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, Start-4-3 played", () => {
      const stackDirection = direction(
        0,
        [0, 1, 2],
        [redStart, redFour, redThree],
        UP_OR_DOWN_VARIANT,
      );
      expect(stackDirection).toBe(StackDirection.Down);
    });
  });
});

describe("nextRanks", () => {
  test("returns [1] for an empty play stack going up in No Variant", () => {
    const nextRanksArray = nextPlayableRanks(
      0,
      [],
      StackDirection.Up,
      defaultStackStarts,
      DEFAULT_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([1]);
  });

  test.each(iRange(5))(
    "returns the next rank for a play stack going up",
    (n) => {
      if (n === 0) {
        return;
      }
      const redCard = {
        ...initialCardState(0, DEFAULT_VARIANT),
        rank: n,
        suitIndex: 0,
      };
      const nextRanksArray = nextPlayableRanks(
        0,
        [0],
        StackDirection.Up,
        defaultStackStarts,
        DEFAULT_VARIANT,
        [redCard],
      );
      expect(nextRanksArray).toStrictEqual([n + 1]);
    },
  );

  test("returns [5] for an empty play stack going down", () => {
    const nextRanksArray = nextPlayableRanks(
      0,
      [],
      StackDirection.Down,
      defaultReverseStackStarts,
      DEFAULT_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([5]);
  });

  test.each(iRange(6))(
    "returns the next rank for a play stack going down",
    (n) => {
      if (n === 0 || n === 1) {
        return;
      }
      const redCard = {
        ...initialCardState(0, DEFAULT_VARIANT),
        rank: n,
        suitIndex: 0,
      };
      const nextRanksArray = nextPlayableRanks(
        0,
        [0],
        StackDirection.Down,
        defaultReverseStackStarts,
        DEFAULT_VARIANT,
        [redCard],
      );
      expect(nextRanksArray).toStrictEqual([n - 1]);
    },
  );

  test("returns [] for a finished play stack (with a red 5)", () => {
    const redFive = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 5,
      suitIndex: 0,
    };
    const nextRanksArray = nextPlayableRanks(
      0,
      [0],
      StackDirection.Finished,
      defaultStackStarts,
      DEFAULT_VARIANT,
      [redFive],
    );
    expect(nextRanksArray).toStrictEqual([]);
  });

  test("returns [] for a finished play stack (with a red 1)", () => {
    const redOne = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: 1,
      suitIndex: 0,
    };
    const nextRanksArray = nextPlayableRanks(
      0,
      [0],
      StackDirection.Finished,
      defaultReverseStackStarts,
      DEFAULT_VARIANT,
      [redOne],
    );
    expect(nextRanksArray).toStrictEqual([]);
  });

  test("returns [1, 5, START_CARD_RANK] for an empty Up or Down play stack", () => {
    const nextRanksArray = nextPlayableRanks(
      0,
      [],
      StackDirection.Undecided,
      defaultStackStarts,
      UP_OR_DOWN_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([1, 5, START_CARD_RANK]);
  });

  test("returns [2, 4] for an Up or Down play stack with a START card", () => {
    const redStart = {
      ...initialCardState(0, UP_OR_DOWN_VARIANT),
      rank: START_CARD_RANK,
      suitIndex: 0,
    };
    const nextRanksArray = nextPlayableRanks(
      0,
      [0],
      StackDirection.Undecided,
      defaultStackStarts,
      UP_OR_DOWN_VARIANT,
      [redStart],
    );
    expect(nextRanksArray).toStrictEqual([2, 4]);
  });
});
