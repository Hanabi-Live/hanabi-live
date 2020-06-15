// Rules related to properties of variants

import Variant from '../types/Variant';

export const isDualColor = (variant: Variant) => variant.name.startsWith('Dual-Color');

export const isAlternatingClues = (variant: Variant) => variant.name.startsWith('Alternating Clues');

export const isClueStarved = (variant: Variant) => variant.name.startsWith('Clue Starved');

export const isCowAndPig = (variant: Variant) => variant.name.startsWith('Cow & Pig');

export const isDuck = (variant: Variant) => variant.name.startsWith('Duck');

export const isThrowItInAHole = (variant: Variant) => variant.name.startsWith('Throw It in a Hole');

export const isUpOrDown = (variant: Variant) => variant.name.startsWith('Up or Down');

export const hasReversedSuits = (variant: Variant) => {
  const suits = variant.suits;
  return isUpOrDown(variant) || suits.filter((s) => s.reversed).length > 0;
};
