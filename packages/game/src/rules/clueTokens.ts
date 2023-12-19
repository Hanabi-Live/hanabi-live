// Functions related to clues: gaining clues, giving clues, applying clues.

import { MAX_CLUE_NUM } from "../constants";
import type { Variant } from "../interfaces/Variant";
import type { ActionDiscard, ActionPlay } from "../types/gameActions";

/** Gain a clue by discarding or finishing a stack. */
export function getNewClueTokensAfterAction(
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete = false,
): number {
  if (
    shouldActionGenerateClueToken(
      action,
      clueTokens,
      variant,
      playStackComplete,
    )
  ) {
    return clueTokens + 1;
  }

  return clueTokens;
}

function shouldActionGenerateClueToken(
  action: ActionPlay | ActionDiscard,
  clueTokens: number,
  variant: Variant,
  playStackComplete: boolean,
) {
  if (isAtMaxClueTokens(clueTokens, variant)) {
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
 *
 * Thus, for a "Clue Starved" variant, if the unadjusted clue tokens were 2, the adjusted clue
 * tokens would be 4.
 */
export function getAdjustedClueTokens(
  clueTokens: number,
  variant: Variant,
): number {
  return variant.clueStarved ? clueTokens * 2 : clueTokens;
}

/** See the documentation for the `getAdjustedClueTokens` function. */
export function getUnadjustedClueTokens(
  clueTokensAdjusted: number,
  variant: Variant,
): number {
  return variant.clueStarved ? clueTokensAdjusted / 2 : clueTokensAdjusted;
}

export function isAtMaxClueTokens(
  clueTokens: number,
  variant: Variant,
): boolean {
  return clueTokens >= getAdjustedClueTokens(MAX_CLUE_NUM, variant);
}

/**
 * The value of clues gained when discarding. This function is only used in efficiency calculations
 * (because we do not want to use floating point numbers for the general case).
 *
 * In "Clue Starved" variants, each discard gives only half a clue.
 */
export function getDiscardClueTokenValue(variant: Variant): number {
  return variant.clueStarved ? 0.5 : 1;
}

/**
 * The value of clues gained when completing a suit. This function is only used in efficiency
 * calculations (because we do not want to use floating point numbers for the general case).
 */
export function getSuitCompleteClueTokenValue(variant: Variant): number {
  if (variant.throwItInAHole) {
    return 0;
  }

  return variant.clueStarved ? 0.5 : 1;
}
