// Rules related to properties of variants.

import type { Variant } from "../../interfaces/Variant";

export function isDualColor(variant: Variant): boolean {
  return variant.suits.some((suit) => suit.clueColors.length >= 2);
}

export function isColorMute(variant: Variant): boolean {
  return variant.clueColors.length === 0;
}

export function isNumberMute(variant: Variant): boolean {
  return variant.clueRanks.length === 0;
}

export function hasReversedSuits(variant: Variant): boolean {
  return variant.upOrDown || variant.suits.some((suit) => suit.reversed);
}
