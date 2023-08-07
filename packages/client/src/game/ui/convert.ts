// These are helper functions that convert objects to the integers that the server expects and vice
// versa.

import type { Color, Suit, Variant } from "@hanabi/data";

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

export function colorToColorIndex(color: Color, variant: Variant): number {
  return variant.clueColors.findIndex((variantColor) => variantColor === color);
}
