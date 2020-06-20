// Functions related to clues: gaining clues, giving clues, applying clues

import { MAX_CLUE_NUM } from '../types/constants';
import { StateCard } from '../types/GameState';
import Variant from '../types/Variant';
import * as variantRules from './variant';

// Gain a clue by discarding or finishing a stack
export function gainClue(variant: Variant, clueTokens: number) {
  if (clueTokens === MAX_CLUE_NUM) {
    return clueTokens;
  }
  return clueTokens + clueValue(variant);
}

// The value of a clue gained when a discard or finishing a suit happens
export function clueValue(variant: Variant) {
  // In "Clue Starved" variants, each discard gives only half a clue.
  if (variantRules.isClueStarved(variant)) {
    return 0.5;
  }
  return 1;
}

export function isClued(card: StateCard) {
  return card.clues.find((c) => c.positive) !== undefined;
}
