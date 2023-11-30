import type { Variant } from "@hanabi/data";
import { HARD_VARIANT_EFFICIENCY_THRESHOLD } from "../../constants";
import * as variantRules from "./variant";

// The H-Group makes a distinction between a "Hard Variant" and an "Easy Variant":
// https://hanabi.github.io/variant-specific/#hard-variants--easy-variants
export function hardVariant(variant: Variant, minEfficiency: number): boolean {
  // Some variants are defined as always being hard, regardless of what the efficiency is.
  if (
    variantRules.isColorMute(variant) ||
    variantRules.isNumberMute(variant) ||
    variant.throwItInAHole ||
    variant.cowAndPig ||
    variant.duck ||
    variant.upOrDown
  ) {
    return true;
  }

  return minEfficiency >= HARD_VARIANT_EFFICIENCY_THRESHOLD;
}
