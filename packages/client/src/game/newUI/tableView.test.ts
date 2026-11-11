import type { CardIdentity, CardOrder } from "@hanabi-live/game";
import {
  getDefaultVariant,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  getHandDisplayOrder,
  getTouchedCards,
  isClueAllowed,
} from "./tableView.ts";

const VARIANT = getDefaultVariant();

describe("getHandDisplayOrder", () => {
  const hand = [3, 7, 9] as CardOrder[];

  test("puts the newest card on the left", () => {
    expect(getHandDisplayOrder(hand, false)).toStrictEqual([9, 7, 3]);
  });

  test("keeps the stored order when the player reversed their hands", () => {
    expect(getHandDisplayOrder(hand, true)).toStrictEqual([3, 7, 9]);
  });
});

describe("getTouchedCards", () => {
  const hand = [0, 1, 2] as CardOrder[];
  const identities = [
    { suitIndex: 0, rank: 1 },
    { suitIndex: 1, rank: 1 },
    { suitIndex: 0, rank: 3 },
  ] as CardIdentity[];

  test("finds the cards of a rank", () => {
    expect(
      getTouchedCards(VARIANT, hand, identities, newRankClue(1)),
    ).toStrictEqual([0, 1]);
  });

  test("finds the cards of a color", () => {
    const red = VARIANT.clueColors[0]!;
    expect(
      getTouchedCards(VARIANT, hand, identities, newColorClue(red)),
    ).toStrictEqual([0, 2]);
  });

  test("skips cards that the viewer cannot see", () => {
    const unknown = [
      { suitIndex: undefined, rank: undefined },
      ...identities.slice(1),
    ] as CardIdentity[];
    expect(
      getTouchedCards(VARIANT, hand, unknown, newRankClue(1)),
    ).toStrictEqual([1]);
  });
});

describe("isClueAllowed", () => {
  const options = { emptyClues: false } as Parameters<typeof isClueAllowed>[3];

  test("needs a clue to touch a card", () => {
    expect(isClueAllowed(newRankClue(1), 0, VARIANT, options)).toBe(false);
    expect(isClueAllowed(newRankClue(1), 2, VARIANT, options)).toBe(true);
  });

  test("allows a clue that touches nothing when the table allows empty clues", () => {
    expect(
      isClueAllowed(newRankClue(1), 0, VARIANT, {
        ...options,
        emptyClues: true,
      }),
    ).toBe(true);
  });
});
