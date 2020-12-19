// Functions related to clues: gaining clues, giving clues, applying clues

import { clueTokensRules } from "../rules";
import { ActionDiscard, ActionPlay } from "../types/actions";
import { MAX_CLUE_NUM } from "../types/constants";
import Variant from "../types/Variant";
import * as variantRules from "./variant";

// Gain a clue by discarding or finishing a stack
export function gain(
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete = false,
): number {
  if (shouldGenerateClue(action, clueTokens, variant, playStackComplete)) {
    return clueTokens + 1;
  }
  return clueTokens;
}

function shouldGenerateClue(
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete: boolean,
) {
  if (clueTokensRules.atMax(clueTokens, variant)) {
    return false;
  }

  switch (action.type) {
    case "play": {
      // Finishing a play stack grants an extra clue
      // (but not in certain variants)
      return playStackComplete && !variantRules.isThrowItInAHole(variant);
    }

    case "discard": {
      // Discarding a card grants an extra clue
      // But misplayed cards do not grant extra clues
      return !action.failed;
    }

    default: {
      return false;
    }
  }
}

export const getAdjusted = (clueTokens: number, variant: Variant): number =>
  // In "Clue Starved" variants, each discard only grants 0.5 clue tokens
  // This is represented on the client by discards granting 1 clue token and clues costing 2 tokens
  // (to avoid having to use floating point numbers)
  variantRules.isClueStarved(variant) ? clueTokens * 2 : clueTokens;

export const getUnadjusted = (
  clueTokensAdjusted: number,
  variant: Variant,
): number =>
  variantRules.isClueStarved(variant)
    ? clueTokensAdjusted / 2
    : clueTokensAdjusted;

export const atMax = (clueTokens: number, variant: Variant): boolean =>
  clueTokens >= getAdjusted(MAX_CLUE_NUM, variant);

// The value of clues gained when discarding
// This function is *only* used in efficiency calculations
export const discardValue = (variant: Variant): number =>
  // In "Clue Starved" variants, each discard gives only half a clue
  variantRules.isClueStarved(variant) ? 0.5 : 1;

// The value of clues gained when completing a suit
// This function is *only* used in efficiency calculations
export const suitValue = (variant: Variant): number => {
  if (variantRules.isThrowItInAHole(variant)) {
    return 0;
  }
  return variantRules.isClueStarved(variant) ? 0.5 : 1;
};
