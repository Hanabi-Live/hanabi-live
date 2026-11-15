// Whether a player may give a clue, as both game screens check it before they send it.

import type { Clue, Options, PlayerIndex, Variant } from "@hanabi-live/game";
import { getCharacterNameForPlayer } from "@hanabi-live/game";

export interface ClueChoice {
  readonly clue: Clue;
  /** How many cards the clue would touch. */
  readonly numTouched: number;
  readonly giverIndex: PlayerIndex | undefined;
  readonly receiverIndex: PlayerIndex;
}

/**
 * Whether a clue may be given. It must touch a card, unless the options, the variant, or the
 * giver's character allow clues that touch nothing. (The server checks the other rules of the
 * characters.)
 */
export function isClueAllowed(
  { clue, numTouched, giverIndex, receiverIndex }: ClueChoice,
  variant: Variant,
  options: Options,
  characterAssignments: Readonly<Array<number | undefined>>,
): boolean {
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
