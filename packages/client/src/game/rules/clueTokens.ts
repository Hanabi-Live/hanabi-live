// Functions related to clues: gaining clues, giving clues, applying clues

import type { Variant } from "@hanabi/data";
import { MAX_CLUE_NUM } from "@hanabi/data";
import type { ActionDiscard, ActionPlay } from "@hanabi/game";

/** Gain a clue by discarding or finishing a stack. */
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
  if (atMax(clueTokens, variant)) {
    return false;
  }

  switch (action.type) {
    case "play": {
      // Finishing a play stack grants an extra clue (but not in certain variants).
      return playStackComplete && !variant.throwItInAHole;
    }

    case "discard": {
      // Discarding a card grants an extra clue. But misplayed cards do not grant extra clues.
      return !action.failed;
    }

    default: {
      return false;
    }
  }
}

/**
 * In "Clue Starved" variants, each discard only grants 0.5 clue tokens. This is represented on the
 * client by discards granting 1 clue token and clues costing 2 tokens (to avoid having to use
 * floating point numbers).
 */
export function getAdjusted(clueTokens: number, variant: Variant): number {
  return variant.clueStarved ? clueTokens * 2 : clueTokens;
}

export function getUnadjusted(
  clueTokensAdjusted: number,
  variant: Variant,
): number {
  return variant.clueStarved ? clueTokensAdjusted / 2 : clueTokensAdjusted;
}

export function atMax(clueTokens: number, variant: Variant): boolean {
  return clueTokens >= getAdjusted(MAX_CLUE_NUM, variant);
}

/**
 * The value of clues gained when discarding. This function is only used in efficiency calculations
 * (because we do not want to use floating point numbers for the general case).
 *
 * In "Clue Starved" variants, each discard gives only half a clue.
 */
export function discardValue(variant: Variant): number {
  return variant.clueStarved ? 0.5 : 1;
}

/**
 * The value of clues gained when completing a suit. This function is *only* used in efficiency
 * calculations.
 */
export function suitValue(variant: Variant): number {
  if (variant.throwItInAHole) {
    return 0;
  }

  return variant.clueStarved ? 0.5 : 1;
}
