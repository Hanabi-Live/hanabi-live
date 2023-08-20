// These are helper functions that convert objects to the integers that the server expects and vice
// versa.

import type { Color, Suit, SuitIndex, Variant } from "@hanabi/data";

export function suitIndexToSuit(
  suitIndex: SuitIndex | null,
  variant: Variant,
): Suit | undefined {
  if (suitIndex === null) {
    return undefined;
  }

  return variant.suits[suitIndex];
}

export function colorToColorIndex(
  color: Color,
  variant: Variant,
): number | undefined {
  const colorIndex = variant.clueColors.indexOf(color);
  return colorIndex === -1 ? undefined : colorIndex;
}
