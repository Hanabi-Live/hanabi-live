import { getCharacter } from '../data/gameData';
import { clueTokensRules } from '../rules';
import GameMetadata from '../types/GameMetadata';
import Variant from '../types/Variant';

export const shouldEndTurnAfterDraw = (
  cardsPlayedOrDiscardedThisTurn: number,
  cardsDiscardedThisTurn: number,
  characterID: number | null,
  clueTokens: number,
  variant: Variant,
) => {
  // Some "Detrimental Characters" are able to perform two actions
  if (characterID !== null) {
    const character = getCharacter(characterID);

    // Panicky - After discarding, discards again if there are 4 clues or less
    if (
      character.name === 'Panicky'
      && clueTokens <= clueTokensRules.getAdjusted(4, variant)
    ) {
      return cardsDiscardedThisTurn !== 1;
    }
  }

  // Otherwise, the turn always increments when:
  // 1) a play or discard happens and
  // 2) a card is drawn
  return cardsPlayedOrDiscardedThisTurn >= 1;
};

export const shouldEndTurnAfterClue = (
  cluesGivenThisTurn: number,
  characterID: number | null,
) => {
  // Some "Detrimental Characters" are able to perform two clues
  if (characterID !== null) {
    const character = getCharacter(characterID);

    if (character.name === 'Genius') {
      return cluesGivenThisTurn === 2;
    }
  }

  // Otherwise, the turn always increments when a clue is given
  return true;
};

export const shouldPlayOrderInvert = (characterID: number | null) => {
  // Some "Detrimental Characters" are able to invert the play order
  if (characterID !== null) {
    const character = getCharacter(characterID);

    if (character.name === 'Contrarian') {
      return true;
    }
  }

  return false;
};

export const getNextPlayerIndex = (
  currentPlayerIndex: number | null,
  numPlayers: number,
  turnsInverted: boolean,
) => {
  if (currentPlayerIndex === null) {
    // If the game is already over, then there is no next player
    return null;
  }

  let nextPlayerIndex;
  if (!turnsInverted) {
    nextPlayerIndex = currentPlayerIndex + 1;
    if (nextPlayerIndex === numPlayers) {
      nextPlayerIndex = 0;
    }
  } else {
    nextPlayerIndex = currentPlayerIndex - 1;
    if (nextPlayerIndex === -1) {
      nextPlayerIndex = numPlayers - 1;
    }
  }

  return nextPlayerIndex;
};

export const getEndTurn = (turn: number, metadata: GameMetadata) => {
  // The Contrarian detrimental character has a 2-turn end game
  if (metadata.options.detrimentalCharacters) {
    for (const characterID of metadata.characterAssignments) {
      if (characterID !== null) {
        const character = getCharacter(characterID);
        if (character.name === 'Contrarian') {
          return turn + 2;
        }
      }
    }
  }

  // By default, each player gets one more turn after the final card is drawn
  return turn + metadata.options.numPlayers;
};
