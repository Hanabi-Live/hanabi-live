// These are helper functions that convert objects to the integers that the server expects and vice
// versa.

import type {
  Color,
  ColorIndex,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";

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
): ColorIndex | undefined {
  // We can't use `variant.clueColors.indexOf` directly because the `Suit` objects may not match
  // exactly in some contexts.
  for (const [i, variantColor] of variant.clueColors.entries()) {
    if (variantColor.name === color.name) {
      return i as ColorIndex;
    }
  }

  return undefined;
}
