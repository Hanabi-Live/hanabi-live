import { getDefaultVariant, getVariant } from "../../gameData";
import { hasReversedSuits } from "./variantIdentity";

const DEFAULT_VARIANT = getDefaultVariant();

describe("hasReversedSuits", () => {
  test("returns false for No Variant", () => {
    expect(hasReversedSuits(DEFAULT_VARIANT)).toBe(false);
  });

  test.each([3, 4, 5, 6])("returns true for Reversed (%i Suits)", (n) => {
    const reversedVariant = getVariant(`Reversed (${n} Suits)`);
    expect(hasReversedSuits(reversedVariant)).toBe(true);
  });

  test.each([3, 4, 5, 6])("returns true for White Reversed (%i Suits)", (n) => {
    const whiteReversedVariant = getVariant(`White Reversed (${n} Suits)`);
    expect(hasReversedSuits(whiteReversedVariant)).toBe(true);
  });

  test.each([5, 6])("returns true for Up or Down (%i Suits)", (n) => {
    const upOrDownVariant = getVariant(`Up or Down (${n} Suits)`);
    expect(hasReversedSuits(upOrDownVariant)).toBe(true);
  });
});
