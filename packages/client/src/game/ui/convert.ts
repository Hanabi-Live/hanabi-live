// These are helper functions that convert objects to the integers that the server expects and vice
// versa.

import { Color, Suit, Variant } from "@hanabi/data";

export function suitIndexToSuit(
  suitIndex: number | null,
  variant: Variant,
): Suit | null {
  if (
    suitIndex === null ||
    suitIndex < 0 ||
    suitIndex >= variant.suits.length
  ) {
    return null;
  }

  return variant.suits[suitIndex]!;
}

export const colorToColorIndex = (color: Color, variant: Variant): number =>
  variant.clueColors.findIndex((variantColor) => variantColor === color);
