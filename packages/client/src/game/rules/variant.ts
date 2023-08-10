// Rules related to properties of variants.

import type { Variant } from "@hanabi/data";

export function isDualColor(variant: Variant): boolean {
  return variant.name.startsWith("Dual-Color");
}

export function isColorMute(variant: Variant): boolean {
  return variant.clueColors.length === 0;
}

export function isNumberMute(variant: Variant): boolean {
  return variant.clueRanks.length === 0;
}

export function isSudoku(variant: Variant): boolean {
  return variant.name.startsWith("Sudoku");
}

export function hasReversedSuits(variant: Variant): boolean {
  return variant.upOrDown || variant.suits.filter((s) => s.reversed).length > 0;
}
