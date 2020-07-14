// Functions related to clues: gaining clues, giving clues, applying clues

import { MAX_CLUE_NUM } from '../types/constants';
import Variant from '../types/Variant';
import * as variantRules from './variant';

// Gain a clue by discarding or finishing a stack
export function gain(variant: Variant, clueTokens: number) {
  if (clueTokens === MAX_CLUE_NUM) {
    return clueTokens;
  }
  return clueTokens + value(variant);
}

// The value of clues gained when discarding or finishing a suit
export function value(variant: Variant) {
  // In "Clue Starved" variants, each discard gives only half a clue
  if (variantRules.isClueStarved(variant)) {
    return 0.5;
  }
  return 1;
}
