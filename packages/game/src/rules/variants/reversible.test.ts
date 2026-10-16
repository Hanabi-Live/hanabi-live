import { describe, expect, test } from "@jest/globals";
import { START_CARD_RANK } from "../../constants";
import { CardStatus } from "../../enums/CardStatus";
import { StackDirection } from "../../enums/StackDirection";
import { getVariant } from "../../gameData";
import type { CardState } from "../../interfaces/CardState";
import type { GameState } from "../../interfaces/GameState";
import type { Rank } from "../../types/Rank";
import type { SuitIndex } from "../../types/SuitIndex";
import { getCardStatus } from "../card";
import { reversibleGetRanksUsefulForMaxScore } from "./reversible";

describe("upOrDownDeadCardsDirectionUndecided", () => {
  test("Handles no discard, no play", () => {
    const allDiscardedSet = new Set<Rank>();
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set([1, 2, 3, 4, 5, START_CARD_RANK]));
  });
  test("Handles ok discards, no play", () => {
    for (const discardedRank of [1, 5, START_CARD_RANK]) {
      const allDiscardedSet = new Set<Rank>([discardedRank as Rank]);
      const ranks = reversibleGetRanksUsefulForMaxScore(
        // eslint-disable-next-line unicorn/no-null
        null,
        allDiscardedSet,
        StackDirection.Undecided,
        true,
      );
      expect(ranks).toEqual(new Set([1, 2, 3, 4, 5, START_CARD_RANK]));
    }
  });
  test("Handles play 1, 2, 3", () => {
    const allDiscardedSet = new Set<Rank>();
    const ranks = reversibleGetRanksUsefulForMaxScore(
      3,
      allDiscardedSet,
      StackDirection.Up,
      true,
    );
    expect(ranks).toEqual(new Set([4, 5]));
  });
  test("Handles play 5, discard 2", () => {
    const allDiscardedSet = new Set<Rank>([2]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      5,
      allDiscardedSet,
      StackDirection.Down,
      true,
    );
    expect(ranks).toEqual(new Set([3, 4]));
  });
  test("Handles discard 2 and 4", () => {
    const allDiscardedSet = new Set<Rank>([2, 4]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set([1, 5, START_CARD_RANK]));
  });
  test("Handles play S, discard 2 and 4", () => {
    const allDiscardedSet = new Set<Rank>([2, 4]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set());
  });
  test("Handles play S discard 2", () => {
    const allDiscardedSet = new Set<Rank>([2]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set([3, 4]));
  });
  test("Handles play S, discard 3", () => {
    const allDiscardedSet = new Set<Rank>([3]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set([2, 4]));
  });
  test("Handles discard 2, 5 and Start", () => {
    const allDiscardedSet = new Set<Rank>([2, 5, START_CARD_RANK]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
      true,
    );
    expect(ranks).toEqual(new Set([1, START_CARD_RANK]));
  });
});

describe("fixed reversed suits cannot start after their starting card is discarded", () => {
  test("discarding the only reversed 5 makes all lower ranks trash", () => {
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      new Set<Rank>([5]),
      StackDirection.Down,
      false,
    );
    expect(ranks).toEqual(new Set());
  });

  test("discarding every normal 1 makes higher ranks trash", () => {
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      new Set<Rank>([1]),
      StackDirection.Up,
      false,
    );
    expect(ranks).toEqual(new Set());
  });
});

describe("Dark Prism Reversed card status (#3047)", () => {
  test("discarding its only 5 marks its remaining ranks as trash", () => {
    const variant = getVariant("Dark Prism Reversed (5 Suits)");
    const suitIndex = variant.suits.findIndex(
      (suit) => suit.reversed && suit.oneOfEach,
    ) as SuitIndex;
    expect(suitIndex).toBeGreaterThanOrEqual(0);

    const playStacks = variant.suits.map(() => []) as unknown as GameState[
      "playStacks"
    ];
    const directions = variant.suits.map((suit) =>
      suit.reversed ? StackDirection.Down : StackDirection.Up,
    ) as unknown as GameState["playStackDirections"];
    const starts = variant.suits.map(() => null) as unknown as GameState[
      "playStackStarts"
    ];
    const discardedFive = {
      order: 0,
      suitIndex,
      rank: 5,
      location: "discard",
    } as unknown as CardState;

    expect(
      getCardStatus(
        suitIndex,
        4,
        [],
        playStacks,
        directions,
        starts,
        variant,
      ),
    ).not.toBe(CardStatus.Trash);

    for (const rank of [1, 2, 3, 4] as const) {
      expect(
        getCardStatus(
          suitIndex,
          rank,
          [discardedFive],
          playStacks,
          directions,
          starts,
          variant,
        ),
      ).toBe(CardStatus.Trash);
    }
  });
});
