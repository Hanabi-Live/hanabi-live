// These are helper functions that convert objects to the integers that the server expects and
// vice versa

import Color from "../types/Color";
import Suit from "../types/Suit";
import Variant from "../types/Variant";

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

  return variant.suits[suitIndex];
}

export const suitToSuitIndex = (suit: Suit | null, variant: Variant): number =>
  suit ? variant.suits.indexOf(suit) : -1;

export const colorToColorIndex = (color: Color, variant: Variant): number =>
  variant.clueColors.findIndex((variantColor) => variantColor === color);
