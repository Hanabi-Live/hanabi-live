import { getCharacter } from "../gameData.ts";
import { PANICKY_MAX_CLUES } from "../generated/protocol.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { Options } from "../interfaces/Options.ts";
import type { Variant } from "../interfaces/Variant.ts";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import { getAdjustedClueTokens } from "./clueTokens.ts";

/** The clues that a Genius gives on each turn: a color clue, then a rank clue. */
const GENIUS_CLUES_PER_TURN = 2;

export function shouldEndTurnAfterDraw(
  cardsPlayedOrDiscardedThisTurn: number,
  cardsDiscardedThisTurn: number,
  characterName: string,
  clueTokens: number,
  variant: Variant,
): boolean {
  // Some "Detrimental Characters" are able to perform two actions.

  // Panicky - After discarding, discards again if there are few enough clues.
  const panickyFirstDiscard =
    cardsDiscardedThisTurn === 1
    && clueTokens <= getAdjustedClueTokens(PANICKY_MAX_CLUES, variant)
    && characterName === "Panicky";

  // Otherwise, the turn always increments when:
  // 1) a play or discard happens and
  // 2) a card is drawn
  return !panickyFirstDiscard && cardsPlayedOrDiscardedThisTurn >= 1;
}

export function shouldEndTurnAfterClue(
  cluesGivenThisTurn: number,
  characterName: string,
): boolean {
  // Some "Detrimental Characters" are able to perform two clues. Otherwise, the turn always
  // increments when a clue is given.
  return (
    characterName !== "Genius" || cluesGivenThisTurn === GENIUS_CLUES_PER_TURN
  );
}

export function shouldPlayOrderInvert(characterName: string): boolean {
  // Some "Detrimental Characters" are able to invert the play order.
  return characterName === "Contrarian";
}

export function getNextPlayerIndex(
  currentPlayerIndex: PlayerIndex | undefined,
  numPlayers: NumPlayers,
  turnsInverted: boolean,
): PlayerIndex | undefined {
  // If the game is already over, then there is no next player.
  if (currentPlayerIndex === undefined) {
    return undefined;
  }

  if (turnsInverted) {
    let previousPlayerIndex = currentPlayerIndex - 1;
    if (previousPlayerIndex === -1) {
      previousPlayerIndex = numPlayers - 1;
    }

    return previousPlayerIndex as PlayerIndex;
  }

  let nextPlayerIndex = currentPlayerIndex + 1;
  if (nextPlayerIndex === numPlayers) {
    nextPlayerIndex = 0;
  }

  return nextPlayerIndex as PlayerIndex;
}

export function getEndGameLength(
  options: Options,
  characterAssignments: Readonly<Array<number | undefined>>,
): number {
  // The Contrarian detrimental character has a 2-turn end game.
  if (options.detrimentalCharacters) {
    for (const characterId of characterAssignments) {
      if (characterId !== undefined) {
        const character = getCharacter(characterId);
        if (character.name === "Contrarian") {
          return 2;
        }
      }
    }
  }

  // By default, each player gets one more turn after the final card is drawn.
  return options.numPlayers;
}

export function getEndTurn(turn: number, metadata: GameMetadata): number {
  return (
    turn + getEndGameLength(metadata.options, metadata.characterAssignments)
  );
}
