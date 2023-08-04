import { getCharacter, Variant } from "@hanabi/data";
import { Options } from "../../types/Options";
import { GameMetadata } from "../types/GameMetadata";
import * as clueTokensRules from "./clueTokens";

export function shouldEndTurnAfterDraw(
  cardsPlayedOrDiscardedThisTurn: number,
  cardsDiscardedThisTurn: number,
  characterName: string,
  clueTokens: number,
  variant: Variant,
): boolean {
  // Some "Detrimental Characters" are able to perform two actions.

  // Panicky - After discarding, discards again if there are 4 clues or less.
  const panickyFirstDiscard =
    cardsDiscardedThisTurn === 1 &&
    clueTokens <= clueTokensRules.getAdjusted(4, variant) &&
    characterName === "Panicky";

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
  return characterName !== "Genius" || cluesGivenThisTurn === 2;
}

export function shouldPlayOrderInvert(characterName: string): boolean {
  // Some "Detrimental Characters" are able to invert the play order.
  return characterName === "Contrarian";
}

export function getNextPlayerIndex(
  currentPlayerIndex: number | null,
  numPlayers: number,
  turnsInverted: boolean,
): number | null {
  if (currentPlayerIndex === null) {
    // If the game is already over, then there is no next player.
    return null;
  }

  let nextPlayerIndex: number;
  if (turnsInverted) {
    nextPlayerIndex = currentPlayerIndex - 1;
    if (nextPlayerIndex === -1) {
      nextPlayerIndex = numPlayers - 1;
    }
  } else {
    nextPlayerIndex = currentPlayerIndex + 1;
    if (nextPlayerIndex === numPlayers) {
      nextPlayerIndex = 0;
    }
  }

  return nextPlayerIndex;
}

export function endGameLength(
  options: Options,
  characterAssignments: Readonly<Array<number | null>>,
): number {
  // The Contrarian detrimental character has a 2-turn end game.
  if (options.detrimentalCharacters) {
    for (const characterID of characterAssignments) {
      if (characterID !== null) {
        const character = getCharacter(characterID);
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
  return turn + endGameLength(metadata.options, metadata.characterAssignments);
}
