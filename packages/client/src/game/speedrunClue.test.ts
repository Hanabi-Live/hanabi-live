import type { SuitIndex, Variant } from "@hanabi-live/game";
import { getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  getColorForSpeedrunClue,
  getRankForSpeedrunClue,
} from "./speedrunClue.ts";

const DUAL_COLOR = getVariant("Dual-Color & Rainbow (6 Suits)");
const PRISM = getVariant("Prism (5 Suits)");

function suitIndexOf(variant: Variant, isSuit: (index: number) => boolean) {
  const index = variant.suits.findIndex((_suit, i) => isSuit(i));
  if (index === -1) {
    throw new Error("The variant has no such suit.");
  }
  return index as SuitIndex;
}

describe("getColorForSpeedrunClue", () => {
  const dualSuitIndex = suitIndexOf(
    DUAL_COLOR,
    (i) => DUAL_COLOR.suits[i]!.clueColors.length === 2,
  );
  const [firstColor, secondColor] = DUAL_COLOR.suits[dualSuitIndex]!.clueColors;

  test("uses the first color of the card", () => {
    expect(
      getColorForSpeedrunClue(DUAL_COLOR, dualSuitIndex, 1, undefined),
    ).toBe(firstColor);
  });

  test("uses the chosen color when it touches the card", () => {
    expect(
      getColorForSpeedrunClue(DUAL_COLOR, dualSuitIndex, 1, secondColor),
    ).toBe(secondColor);
  });

  test("ignores a chosen color that does not touch the card", () => {
    const otherColor = DUAL_COLOR.clueColors.find(
      (color) => color !== firstColor && color !== secondColor,
    );
    expect(
      getColorForSpeedrunClue(DUAL_COLOR, dualSuitIndex, 1, otherColor),
    ).toBe(firstColor);
  });

  test("uses the color that touches a prism card of its rank", () => {
    const prismSuitIndex = suitIndexOf(PRISM, (i) => PRISM.suits[i]!.prism);
    expect(getColorForSpeedrunClue(PRISM, prismSuitIndex, 2, undefined)).toBe(
      PRISM.clueColors[1],
    );
  });

  test("gives no clue for a card that the viewer cannot see", () => {
    expect(
      getColorForSpeedrunClue(DUAL_COLOR, undefined, undefined, undefined),
    ).toBeUndefined();
  });
});

describe("getRankForSpeedrunClue", () => {
  test("uses the rank of the card", () => {
    expect(getRankForSpeedrunClue(PRISM, 0, 3, undefined)).toBe(3);
  });

  test("ignores a chosen rank that does not touch the card", () => {
    expect(getRankForSpeedrunClue(PRISM, 0, 3, 2)).toBe(3);
  });

  test("uses a rank that touches the card when its own rank is not a clue", () => {
    const oddsAndEvens = getVariant("Odds and Evens (5 Suits)");
    expect(getRankForSpeedrunClue(oddsAndEvens, 0, 3, undefined)).toBe(1);
    expect(getRankForSpeedrunClue(oddsAndEvens, 0, 4, undefined)).toBe(2);
  });
});
