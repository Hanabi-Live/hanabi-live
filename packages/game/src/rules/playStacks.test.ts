/* eslint-disable unicorn/no-null */

import type { Tuple } from "complete-common";
import { eRange, newArray } from "complete-common";
import { START_CARD_RANK } from "../constants";
import { StackDirection } from "../enums/StackDirection";
import { getDefaultVariant, getVariant } from "../gameData";
import { getInitialCardState } from "../reducers/initialStates/initialCardState";
import type { CardOrder } from "../types/CardOrder";
import type { NumSuits } from "../types/NumSuits";
import type { Rank } from "../types/Rank";
import { getNextPlayableRanks, getStackDirection } from "./playStacks";

const NUM_PLAYERS = 2;
const DEFAULT_VARIANT = getDefaultVariant();
const UP_OR_DOWN_VARIANT = getVariant("Up or Down (6 Suits)");
const REVERSED_VARIANT = getVariant("Reversed (6 Suits)");

const DEFAULT_PLAY_STACK_STARTS = newArray(
  DEFAULT_VARIANT.suits.length,
  null,
) as Tuple<Rank | null, NumSuits>;
const DEFAULT_PLAY_STACK_STARTS_REVERSED = newArray(
  REVERSED_VARIANT.suits.length,
  null,
) as Tuple<Rank | null, NumSuits>;

describe("direction", () => {
  test("returns Up for No Variant, not finished", () => {
    const playStackDirection = getStackDirection(0, [], [], DEFAULT_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test("returns Down for the reversed suit", () => {
    const playStackDirection = getStackDirection(5, [], [], REVERSED_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Down);
  });

  test("returns Up for the non-reversed suits in Reversed", () => {
    const playStackDirection = getStackDirection(0, [], [], REVERSED_VARIANT);
    expect(playStackDirection).toBe(StackDirection.Up);
  });

  test("returns Finished for No Variant, 5 cards played", () => {
    const playStackDirection = getStackDirection(
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
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: START_CARD_RANK,
      suitIndex: 0,
    } as const;
    const redOne = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 1,
      suitIndex: 0,
    } as const;
    const redTwo = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 2,
      suitIndex: 0,
    } as const;
    const redThree = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 3,
      suitIndex: 0,
    } as const;
    const redFour = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 4,
      suitIndex: 0,
    } as const;
    const redFive = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 5,
      suitIndex: 0,
    } as const;

    test("returns Finished for Up or Down, 5 cards played", () => {
      const playStackDirection = getStackDirection(
        0,
        [1, 2, 3, 4, 5],
        [],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Finished);
    });

    test("returns Undecided for Up or Down, no cards played", () => {
      const playStackDirection = getStackDirection(
        0,
        [],
        [],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test("returns Undecided for Up or Down, START played", () => {
      const playStackDirection = getStackDirection(
        0,
        [0],
        [redStart],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Undecided);
    });

    test("returns Up for Up or Down, 1 played", () => {
      const playStackDirection = getStackDirection(
        0,
        [0],
        [redOne],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, 5 played", () => {
      const playStackDirection = getStackDirection(
        0,
        [0],
        [redFive],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Down);
    });

    test("returns Up for Up or Down, Start then 2 played", () => {
      const playStackDirection = getStackDirection(
        0,
        [0, 1],
        [redStart, redTwo],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, Start then 4 played", () => {
      const playStackDirection = getStackDirection(
        0,
        [0, 1],
        [redStart, redFour],
        UP_OR_DOWN_VARIANT,
      );
      expect(playStackDirection).toBe(StackDirection.Down);
    });

    test("returns Up for Up or Down, Start-2-3 played", () => {
      const stackDirection = getStackDirection(
        0,
        [0, 1, 2],
        [redStart, redTwo, redThree],
        UP_OR_DOWN_VARIANT,
      );
      expect(stackDirection).toBe(StackDirection.Up);
    });

    test("returns Down for Up or Down, Start-4-3 played", () => {
      const stackDirection = getStackDirection(
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
    const nextRanksArray = getNextPlayableRanks(
      0,
      [],
      StackDirection.Up,
      DEFAULT_PLAY_STACK_STARTS,
      DEFAULT_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([1]);
  });

  test.each([...eRange(5)])(
    "returns the next rank for a play stack going up",
    (n) => {
      if (n === 0) {
        return;
      }
      const redCard = {
        ...getInitialCardState(0 as CardOrder, DEFAULT_VARIANT, NUM_PLAYERS),
        rank: n as Rank,
        suitIndex: 0,
      } as const;
      const nextRanksArray = getNextPlayableRanks(
        0,
        [0],
        StackDirection.Up,
        DEFAULT_PLAY_STACK_STARTS,
        DEFAULT_VARIANT,
        [redCard],
      );
      expect(nextRanksArray).toStrictEqual([n + 1]);
    },
  );

  test("returns [5] for an empty play stack going down", () => {
    const nextRanksArray = getNextPlayableRanks(
      0,
      [],
      StackDirection.Down,
      DEFAULT_PLAY_STACK_STARTS_REVERSED,
      DEFAULT_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([5]);
  });

  test.each([...eRange(6)])(
    "returns the next rank for a play stack going down",
    (n) => {
      if (n === 0 || n === 1) {
        return;
      }
      const redCard = {
        ...getInitialCardState(0 as CardOrder, DEFAULT_VARIANT, NUM_PLAYERS),
        rank: n as Rank,
        suitIndex: 0,
      } as const;
      const nextRanksArray = getNextPlayableRanks(
        0,
        [0],
        StackDirection.Down,
        DEFAULT_PLAY_STACK_STARTS_REVERSED,
        DEFAULT_VARIANT,
        [redCard],
      );
      expect(nextRanksArray).toStrictEqual([n - 1]);
    },
  );

  test("returns [] for a finished play stack (with a red 5)", () => {
    const redFive = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 5,
      suitIndex: 0,
    } as const;
    const nextRanksArray = getNextPlayableRanks(
      0,
      [0],
      StackDirection.Finished,
      DEFAULT_PLAY_STACK_STARTS,
      DEFAULT_VARIANT,
      [redFive],
    );
    expect(nextRanksArray).toStrictEqual([]);
  });

  test("returns [] for a finished play stack (with a red 1)", () => {
    const redOne = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: 1,
      suitIndex: 0,
    } as const;
    const nextRanksArray = getNextPlayableRanks(
      0,
      [0],
      StackDirection.Finished,
      DEFAULT_PLAY_STACK_STARTS_REVERSED,
      DEFAULT_VARIANT,
      [redOne],
    );
    expect(nextRanksArray).toStrictEqual([]);
  });

  test("returns [1, 5, START_CARD_RANK] for an empty Up or Down play stack", () => {
    const nextRanksArray = getNextPlayableRanks(
      0,
      [],
      StackDirection.Undecided,
      DEFAULT_PLAY_STACK_STARTS,
      UP_OR_DOWN_VARIANT,
      [],
    );
    expect(nextRanksArray).toStrictEqual([1, 5, START_CARD_RANK]);
  });

  test("returns [2, 4] for an Up or Down play stack with a START card", () => {
    const redStart = {
      ...getInitialCardState(0 as CardOrder, UP_OR_DOWN_VARIANT, NUM_PLAYERS),
      rank: START_CARD_RANK,
      suitIndex: 0,
    } as const;
    const nextRanksArray = getNextPlayableRanks(
      0,
      [0],
      StackDirection.Undecided,
      DEFAULT_PLAY_STACK_STARTS,
      UP_OR_DOWN_VARIANT,
      [redStart],
    );
    expect(nextRanksArray).toStrictEqual([2, 4]);
  });
});
