/* eslint-disable import/prefer-default-export */
// Miscellaneous helpers used by several reducers

import { VARIANTS } from '../data/gameData';
import Color from '../types/Color';
import GameMetadata from '../types/GameMetadata';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

export function getVariant(metadata: GameMetadata) {
  const variant = VARIANTS.get(metadata.options.variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${metadata.options.variantName}" variant in the "VARIANTS" map.`);
  }
  return variant;
}

export function getIndexConverter(variant: Variant) {
  const suitIndexes: Map<string, number> = new Map<string, number>();
  const colorIndexes: Map<Color, number> = new Map<Color, number>();
  variant.suits.forEach((suit, index) => suitIndexes.set(suit.name, index));
  variant.clueColors.forEach((color, index) => colorIndexes.set(color, index));

  function getIndex<T extends Suit | Color>(value: T): number {
    // HACK: test a member of the interface that is exclusive to Suit
    if ((value as Suit).reversed !== undefined) {
      return suitIndexes.get(value.name)!;
    }
    return colorIndexes.get(value)!;
  }

  return getIndex;
}
