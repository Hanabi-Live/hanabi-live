import { describe, expect, test } from "bun:test";
import { getDefaultVariant, getVariant } from "../gameData.ts";
import { getTotalCardsInDeck } from "./deck.ts";

const DEFAULT_VARIANT = getDefaultVariant();

describe("getTotalCardsInDeck", () => {
  test("returns 50 for No Variant", () => {
    expect(getTotalCardsInDeck(DEFAULT_VARIANT)).toBe(50);
  });

  test.each([
    [3, 30],
    [4, 40],
    [6, 60],
  ])("counts cards for %i suits", (suits, cards) => {
    const variant = getVariant(`${suits} Suits`);
    expect(getTotalCardsInDeck(variant)).toBe(cards);
  });

  test.each([
    [5, 45],
    [6, 55],
  ])("counts cards for Black (%i suits)", (suits, cards) => {
    const blackVariant = getVariant(`Black (${suits} Suits)`);
    expect(getTotalCardsInDeck(blackVariant)).toBe(cards);
  });

  test.each([
    [5, 45],
    [6, 54],
  ])("counts cards for Up or Down (%i suits)", (suits, cards) => {
    const upOrDownVariant = getVariant(`Up or Down (${suits} Suits)`);
    expect(getTotalCardsInDeck(upOrDownVariant)).toBe(cards);
  });

  test("counts both reductions from Scarce Ones and Critical Fours", () => {
    const combinedVariant = {
      ...DEFAULT_VARIANT,
      scarceOnes: true,
      criticalRank: 4,
    } as const;

    expect(getTotalCardsInDeck(combinedVariant)).toBe(40);
  });

  test("counts both missing Double Darks", () => {
    const blackAndDarkOrange = getVariant("Black & Dark Orange (6 Suits)");
    const scarceAndCriticalFours = getVariant(
      "Scarce Ones & Critical Fours (6 Suits)",
    );

    expect(getTotalCardsInDeck(blackAndDarkOrange)).toBe(50);
    expect(getTotalCardsInDeck(scarceAndCriticalFours)).toBe(48);
  });
});
