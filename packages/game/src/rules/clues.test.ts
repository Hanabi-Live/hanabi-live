import { describe, expect, test } from "bun:test";
import { assertDefined } from "complete-common";
import { getVariant } from "../gameData.ts";
import { isCardTouchedByClueColor } from "./clues.ts";

describe("isCardTouchedByClueColor", () => {
  test("touches White but not Null by rank in Synesthesia", () => {
    for (const [suitName, touched] of [
      ["White", true],
      ["Null", false],
    ] as const) {
      const variant = getVariant(`Synesthesia & ${suitName} (5 Suits)`);
      const suit = variant.suits.at(-1);
      const green = variant.clueColors[2];
      assertDefined(suit, "Failed to get the last suit.");
      assertDefined(green, "Failed to get the third clue color.");
      expect(suit.name).toBe(suitName);
      expect(green.name).toBe("Green");
      expect(isCardTouchedByClueColor(variant, green, suit, 3)).toBe(touched);
      expect(isCardTouchedByClueColor(variant, green, suit, 2)).toBe(false);
    }
  });
});
