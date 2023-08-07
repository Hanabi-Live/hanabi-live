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

export function isAlternatingClues(variant: Variant): boolean {
  return variant.name.startsWith("Alternating Clues");
}

export function isClueStarved(variant: Variant): boolean {
  return variant.name.startsWith("Clue Starved");
}

export function isCowAndPig(variant: Variant): boolean {
  return variant.name.startsWith("Cow & Pig");
}

export function isDuck(variant: Variant): boolean {
  return variant.name.startsWith("Duck");
}

export function isThrowItInAHole(variant: Variant): boolean {
  return variant.name.startsWith("Throw It in a Hole");
}

export function isSudoku(variant: Variant): boolean {
  return variant.name.startsWith("Sudoku");
}

export function isUpOrDown(variant: Variant): boolean {
  return variant.name.startsWith("Up or Down");
}

export function isSynesthesia(variant: Variant): boolean {
  return variant.name.startsWith("Synesthesia");
}

export function isCriticalFours(variant: Variant): boolean {
  return variant.name.startsWith("Critical Fours");
}

export function isOddsAndEvens(variant: Variant): boolean {
  return variant.name.startsWith("Odds and Evens");
}

export function hasReversedSuits(variant: Variant): boolean {
  return (
    isUpOrDown(variant) || variant.suits.filter((s) => s.reversed).length > 0
  );
}
