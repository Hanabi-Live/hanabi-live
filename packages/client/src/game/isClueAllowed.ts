// Whether a player may give a clue, as both game screens check it before they send it.

import type {
  Clue,
  ClueType,
  Options,
  PlayerIndex,
  Variant,
} from "@hanabi-live/game";
import { getCharacterNameForPlayer } from "@hanabi-live/game";

export interface ClueChoice {
  readonly clue: Clue;
  /** How many cards the clue would touch. */
  readonly numTouched: number;
  readonly giverIndex: PlayerIndex | undefined;
  readonly receiverIndex: PlayerIndex;
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
 * must touch a card, unless the options, the variant, or the giver's character allow clues that
 * touch nothing. (The server checks the other rules of the characters.)
 */
export function isClueAllowed(
  { clue, numTouched, giverIndex, receiverIndex, lastClueType }: ClueChoice,
  variant: Variant,
  options: Options,
  characterAssignments: Readonly<Array<number | undefined>>,
): boolean {
  if (!isClueTypeAllowed(clue.type, lastClueType, variant)) {
    return false;
  }

  if (
    numTouched > 0
    || options.emptyClues
    || (clue.type === "color" && variant.colorCluesTouchNothing)
    || (clue.type === "rank" && variant.rankCluesTouchNothing)
  ) {
    return true;
  }

  if (giverIndex === undefined) {
    return false;
  }

  // "Blind Spot" may give any clue to the next player, and "Oblivious" to the previous player.
  const { numPlayers } = options;
  const characterName = getCharacterNameForPlayer(
    giverIndex,
    characterAssignments,
  );
  return (
    (characterName === "Blind Spot"
      && receiverIndex === (giverIndex + 1) % numPlayers)
    || (characterName === "Oblivious"
      && receiverIndex === (giverIndex - 1 + numPlayers) % numPlayers)
  );
}
