import { getCharacter } from '../data/gameData';

export const shouldEndTurnAfterDraw = (
  cardsPlayedOrDiscardedThisTurn: number,
  characterID: number | null,
  clueTokens: number,
) => {
  // Some "Detrimental Characters" are able to perform two actions
  if (characterID !== null) {
    const character = getCharacter(characterID);

    // TODO fix this to be 8 when clue tokens are doubled
    if (character.name === 'Panicky' && clueTokens <= 4) {
      return cardsPlayedOrDiscardedThisTurn >= 2;
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
