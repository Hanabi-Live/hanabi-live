/* eslint-disable complete/prefer-readonly-parameter-types */

import { describe, expect, test } from "@jest/globals";
import { getDefaultVariant, getVariant } from "../gameData";
import { getTotalCardsInDeck } from "./deck";

const DEFAULT_VARIANT = getDefaultVariant();

describe("getTotalCardsInDeck", () => {
  test("returns 50 for No Variant", () => {
    expect(getTotalCardsInDeck(DEFAULT_VARIANT)).toBe(50);
  });

  test.each`
    suits | cards
    ${3}  | ${30}
    ${4}  | ${40}
    ${6}  | ${60}
  `("returns $cards for $suits suits", ({ suits, cards }) => {
    const variant = getVariant(`${suits} Suits`);
    expect(getTotalCardsInDeck(variant)).toBe(cards);
  });

  test.each`
    suits | cards
    ${5}  | ${45}
    ${6}  | ${55}
  `("returns $cards for Black ($suits suits)", ({ suits, cards }) => {
    const blackVariant = getVariant(`Black (${suits} Suits)`);
    expect(getTotalCardsInDeck(blackVariant)).toBe(cards);
  });

  test.each`
    suits | cards
    ${5}  | ${45}
    ${6}  | ${54}
  `("returns $cards for Up or Down ($suits suits)", ({ suits, cards }) => {
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
