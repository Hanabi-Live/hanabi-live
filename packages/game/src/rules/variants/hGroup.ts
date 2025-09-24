import type { Variant } from "../../interfaces/Variant";
import { isColorMute, isNumberMute } from "./variantIdentity";

const HARD_VARIANT_EFFICIENCY_THRESHOLD = 1.33;

// The H-Group makes a distinction between a "Hard Variant" and an "Easy Variant":
// https://hanabi.github.io/variant-specific/#hard-variants--easy-variants
export function isHardVariant(
  variant: Variant,
  minEfficiency: number,
): boolean {
  // Some variants are defined as always being hard, regardless of what the efficiency is.
  if (
    isColorMute(variant)
    || isNumberMute(variant)
    || variant.throwItInAHole
    || variant.cowAndPig
    || variant.duck
    || variant.upOrDown
  ) {
    return true;
  }

  return minEfficiency >= HARD_VARIANT_EFFICIENCY_THRESHOLD;
}
