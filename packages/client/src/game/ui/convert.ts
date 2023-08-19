// These are helper functions that convert objects to the integers that the server expects and vice
// versa.

import type { Color, Suit, SuitIndex, Variant } from "@hanabi/data";

export function suitIndexToSuit(
  suitIndex: SuitIndex | null,
  variant: Variant,
): Suit | null {
  if (suitIndex === null) {
    return null;
  }

  return variant.suits[suitIndex] ?? null;
}

export function colorToColorIndex(color: Color, variant: Variant): number {
  return variant.clueColors.indexOf(color);
}
