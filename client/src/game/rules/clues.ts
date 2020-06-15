/* eslint-disable import/prefer-default-export */
// Functions related to clues: gaining clues, giving clues, applying clues

import { MAX_CLUE_NUM } from '../types/constants';
import Variant from '../types/Variant';
import * as variantRules from './variant';

// Gain a clue by discarding or finishing a stack
export function gainClue(variant: Variant, clueTokens: number) {
  if (clueTokens === MAX_CLUE_NUM) {
    return clueTokens;
  }
  if (variantRules.isClueStarved(variant)) {
    // In "Clue Starved" variants, each discard gives only half a clue.
    return clueTokens + 0.5;
  }
  return clueTokens + 1;
}
