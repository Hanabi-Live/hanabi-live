import { Variant } from "@hanabi/data";
import * as variantRules from "./variant";

// The H-Group makes a distinction between a "Hard Variant" and an "Easy Variant":
// https://hanabi.github.io/docs/variant_specific/#hard-variants--easy-variants
export function hardVariant(variant: Variant, minEfficiency: number): boolean {
  // Some variants are defined as always being hard, regardless of what the efficiency is.
  if (
    variantRules.isMix(variant) ||
    variantRules.isColorMute(variant) ||
    variantRules.isNumberMute(variant) ||
    variantRules.isThrowItInAHole(variant) ||
    variantRules.isCowAndPig(variant) ||
    variantRules.isDuck(variant) ||
    variantRules.isUpOrDown(variant)
  ) {
    return true;
  }

  return minEfficiency >= 1.25;
}
