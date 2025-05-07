import { START_CARD_RANK } from "../../constants";
import { StackDirection } from "../../enums/StackDirection";
import type { Rank } from "../../types/Rank";
import { reversibleGetRanksUsefulForMaxScore } from "./reversible";

describe("upOrDownDeadCardsDirectionUndecided", () => {
  test("Handles no discard, no play", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([1, 2, 3, 4, 5, START_CARD_RANK]));
  });
  test("Handles ok discards, no play", () => {
    for (const discardedRank of [1, 5, START_CARD_RANK]) {
      const allDiscardedSet: Set<Rank> = new Set<Rank>([discardedRank as Rank]);
      const ranks = reversibleGetRanksUsefulForMaxScore(
        // eslint-disable-next-line unicorn/no-null
        null,
        allDiscardedSet,
        StackDirection.Undecided,
      );
      expect(ranks).toEqual(new Set([1, 2, 3, 4, 5, START_CARD_RANK]));
    }
  });
  test("Handles play 1, 2, 3", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      3 as Rank,
      allDiscardedSet,
      StackDirection.Up,
    );
    expect(ranks).toEqual(new Set([4, 5]));
  });
  test("Handles play 5, discard 2", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      5 as Rank,
      allDiscardedSet,
      StackDirection.Down,
    );
    expect(ranks).toEqual(new Set([3, 4]));
  });
  test("Handles discard 2 and 4", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2, 4]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([1, 5, START_CARD_RANK]));
  });
  test("Handles play S, discard 2 and 4", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2, 4]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([]));
  });
  test("Handles play S discard 2", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([3, 4]));
  });
  test("Handles play S, discard 3", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([3]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      START_CARD_RANK,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([2, 4]));
  });
  test("Handles discard 2, 5 and Start", () => {
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2, 5, START_CARD_RANK]);
    const ranks = reversibleGetRanksUsefulForMaxScore(
      // eslint-disable-next-line unicorn/no-null
      null,
      allDiscardedSet,
      StackDirection.Undecided,
    );
    expect(ranks).toEqual(new Set([1, START_CARD_RANK]));
  });
});
