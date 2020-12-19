// Rules related to properties of variants

import Variant from "../types/Variant";

export const isDualColor = (variant: Variant): boolean =>
  variant.name.startsWith("Dual-Color");

export const isMix = (variant: Variant): boolean =>
  variant.name.includes("Mix");

export const isColorMute = (variant: Variant): boolean =>
  variant.clueColors.length === 0;

export const isNumberMute = (variant: Variant): boolean =>
  variant.clueRanks.length === 0;

export const isAlternatingClues = (variant: Variant): boolean =>
  variant.name.startsWith("Alternating Clues");

export const isClueStarved = (variant: Variant): boolean =>
  variant.name.startsWith("Clue Starved");

export const isCowAndPig = (variant: Variant): boolean =>
  variant.name.startsWith("Cow & Pig");

export const isDuck = (variant: Variant): boolean =>
  variant.name.startsWith("Duck");

export const isThrowItInAHole = (variant: Variant): boolean =>
  variant.name.startsWith("Throw It in a Hole");

export const isUpOrDown = (variant: Variant): boolean =>
  isNameUpOrDown(variant.name);

export const isNameUpOrDown = (variantName: string): boolean =>
  variantName.startsWith("Up or Down");

export const hasReversedSuits = (variant: Variant): boolean =>
  isUpOrDown(variant) || variant.suits.filter((s) => s.reversed).length > 0;
