import type { Options } from "@hanabi-live/game";
import { getDefaultVariant, getVariant, newRankClue } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { isClueAllowed } from "./isClueAllowed.ts";

const VARIANT = getDefaultVariant();
const OPTIONS = {
  emptyClues: false,
  numPlayers: 4,
} as Options;

function isAllowed(numTouched: number, options: Options = OPTIONS) {
  return isClueAllowed(
    {
      clue: newRankClue(1),
      numTouched,
      lastClueType: undefined,
    },
    VARIANT,
    options,
  );
}

describe("isClueAllowed", () => {
  test("needs a clue to touch a card", () => {
    expect(isAllowed(0)).toBe(false);
    expect(isAllowed(2)).toBe(true);
  });

  test("allows a clue that touches nothing when the table allows empty clues", () => {
    expect(
      isAllowed(0, {
        ...OPTIONS,
        emptyClues: true,
      }),
    ).toBe(true);
  });

  test('refuses a clue of the same type as the last clue in "Alternating Clues" variants', () => {
    const variant = getVariant("Alternating Clues (5 Suits)");
    function isAllowedAfter(lastClueType: "color" | "rank" | undefined) {
      return isClueAllowed(
        {
          clue: newRankClue(1),
          numTouched: 1,
          lastClueType,
        },
        variant,
        OPTIONS,
      );
    }
    expect(isAllowedAfter("rank")).toBe(false);
    expect(isAllowedAfter("color")).toBe(true);
    expect(isAllowedAfter(undefined)).toBe(true);
  });
});
