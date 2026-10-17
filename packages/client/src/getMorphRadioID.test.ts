import { getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { getMorphRadioID } from "./getMorphRadioID";

const variant = getVariant("Dual-Color & Light Pink (6 Suits)");

describe("morph radio IDs", () => {
  test("distinguishes Indigo and Light Pink, despite their shared abbreviation", () => {
    const indigoIndex = variant.suits.findIndex(
      (suit) => suit.name === "Indigo",
    );
    const lightPinkIndex = variant.suits.findIndex(
      (suit) => suit.name === "Light Pink",
    );

    expect(indigoIndex).toBeGreaterThanOrEqual(0);
    expect(lightPinkIndex).toBeGreaterThanOrEqual(0);
    expect(variant.suits[indigoIndex]?.abbreviation).toBe("I");
    expect(variant.suits[lightPinkIndex]?.abbreviation).toBe("I");

    expect(getMorphRadioID(indigoIndex, 5)).not.toBe(
      getMorphRadioID(lightPinkIndex, 5),
    );
  });

  test("uses unique IDs for every selectable card in the variant", () => {
    const ids = variant.ranks.flatMap((rank) =>
      variant.suits.map((_suit, suitIndex) => getMorphRadioID(suitIndex, rank)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
