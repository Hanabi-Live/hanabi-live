// Whether a player may give a clue, as both game screens check it before they send it.

import type { Clue, ClueType, Options, Variant } from "@hanabi-live/game";

export interface ClueChoice {
  readonly clue: Clue;
  /** How many cards the clue would touch. */
  readonly numTouched: number;
  /** The type of the last clue, or undefined before the first clue and for a hidden clue. */
  readonly lastClueType: ClueType | undefined;
}

/** In "Alternating Clues" variants, a clue cannot have the same type as the last clue. */
export function isClueTypeAllowed(
  clueType: ClueType,
  lastClueType: ClueType | undefined,
  variant: Variant,
): boolean {
  return !variant.alternatingClues || clueType !== lastClueType;
}

/**
 * Whether a clue may be given. Its type must follow the rule of "Alternating Clues" variants. It
 * must touch a card, unless the options or the variant allow clues that touch nothing.
 */
export function isClueAllowed(
  { clue, numTouched, lastClueType }: ClueChoice,
  variant: Variant,
  options: Options,
): boolean {
  return (
    isClueTypeAllowed(clue.type, lastClueType, variant)
    && (numTouched > 0
      || options.emptyClues
      || (clue.type === "color" && variant.colorCluesTouchNothing)
      || (clue.type === "rank" && variant.rankCluesTouchNothing))
  );
}
