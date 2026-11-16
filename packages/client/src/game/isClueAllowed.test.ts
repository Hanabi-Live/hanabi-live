import type { Options, PlayerIndex } from "@hanabi-live/game";
import {
  getCharacters,
  getDefaultVariant,
  getVariant,
  newRankClue,
} from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { isClueAllowed } from "./isClueAllowed.ts";

const VARIANT = getDefaultVariant();
const OPTIONS = {
  emptyClues: false,
  numPlayers: 4,
} as Options;

function characterId(name: string): number {
  const character = getCharacters().find((entry) => entry.name === name);
  if (character === undefined) {
    throw new Error(`There is no character named "${name}".`);
  }
  return character.id;
}

function isAllowed(
  numTouched: number,
  receiverIndex: number,
  {
    options = OPTIONS,
    giverCharacter,
  }: { options?: Options; giverCharacter?: string } = {},
) {
  return isClueAllowed(
    {
      clue: newRankClue(1),
      numTouched,
      giverIndex: 0,
      receiverIndex: receiverIndex as PlayerIndex,
      lastClueType: undefined,
    },
    VARIANT,
    options,
    giverCharacter === undefined ? [] : [characterId(giverCharacter)],
  );
}

describe("isClueAllowed", () => {
  test("needs a clue to touch a card", () => {
    expect(isAllowed(0, 1)).toBe(false);
    expect(isAllowed(2, 1)).toBe(true);
  });

  test("allows a clue that touches nothing when the table allows empty clues", () => {
    expect(
      isAllowed(0, 1, {
        options: {
          ...OPTIONS,
          emptyClues: true,
        },
      }),
    ).toBe(true);
  });

  test('lets "Blind Spot" give any clue to the next player only', () => {
    expect(isAllowed(0, 1, { giverCharacter: "Blind Spot" })).toBe(true);
    expect(isAllowed(0, 3, { giverCharacter: "Blind Spot" })).toBe(false);
  });

  test('lets "Oblivious" give any clue to the previous player only', () => {
    expect(isAllowed(0, 3, { giverCharacter: "Oblivious" })).toBe(true);
    expect(isAllowed(0, 1, { giverCharacter: "Oblivious" })).toBe(false);
  });

  test('refuses a clue of the same type as the last clue in "Alternating Clues" variants', () => {
    const variant = getVariant("Alternating Clues (5 Suits)");
    function isAllowedAfter(lastClueType: "color" | "rank" | undefined) {
      return isClueAllowed(
        {
          clue: newRankClue(1),
          numTouched: 1,
          giverIndex: 0,
          receiverIndex: 1,
          lastClueType,
        },
        variant,
        OPTIONS,
        [],
      );
    }
    expect(isAllowedAfter("rank")).toBe(false);
    expect(isAllowedAfter("color")).toBe(true);
    expect(isAllowedAfter(undefined)).toBe(true);
  });
});
