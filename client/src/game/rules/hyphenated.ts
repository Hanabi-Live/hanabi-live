/* eslint-disable import/prefer-default-export */

import { variantRules } from "../rules";
import Variant from "../types/Variant";

// The Hyphen-ated group makes a distinction between a "Hard Variant" and an "Easy Variant"
// https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#hard-variants--easy-variants
export function hardVariant(variant: Variant, minEfficiency: number): boolean {
  // Some variants are defined as always being hard, regardless of what the efficiency is
  if (
    // As long as the variant contains a "Null" or "Dark Null" suit,
    // the variant is considered to be hard
    variant.suits.some(
      (suit) => suit.name === "Null" || suit.name === "Dark Null",
    ) ||
    variantRules.isMix(variant) ||
    variantRules.isColorMute(variant) ||
    variantRules.isNumberMute(variant) ||
    variantRules.isThrowItInAHole(variant) ||
    variantRules.isCowAndPig(variant) ||
    variantRules.isDuck(variant)
  ) {
    return true;
  }

  return minEfficiency >= 1.25;
}
