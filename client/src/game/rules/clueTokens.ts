// Functions related to clues: gaining clues, giving clues, applying clues

import { ActionPlay, ActionDiscard } from '../types/actions';
import { MAX_CLUE_NUM } from '../types/constants';
import Variant from '../types/Variant';
import * as variantRules from './variant';

// Gain a clue by discarding or finishing a stack
export const gain = (
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete: boolean = false,
) => {
  if (shouldGet(action, clueTokens, variant, playStackComplete)) {
    return clueTokens + value(variant);
  }
  return clueTokens;
};

const shouldGet = (
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete: boolean,
) => {
  if (clueTokens === MAX_CLUE_NUM) {
    return false;
  }

  switch (action.type) {
    case 'play': {
      // Finishing a play stack grants an extra clue
      // (but not in certain variants)
      return playStackComplete && !variantRules.isThrowItInAHole(variant);
    }

    case 'discard': {
      // Discarding a card grants an extra clue
      // But misplayed cards do not grant extra clues
      return !action.failed;
    }

    default: {
      return false;
    }
  }
};

// The value of clues gained when discarding or finishing a suit
export const value = (variant: Variant) => {
  // In "Clue Starved" variants, each discard gives only half a clue
  if (variantRules.isClueStarved(variant)) {
    return 0.5;
  }
  return 1;
};
