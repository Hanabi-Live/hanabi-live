import { CHARACTERS } from '../data/gameData';

export function shouldEndTurnAfterDraw(
  cardsPlayedOrDiscardedThisTurn: number,
  characterID: number | null,
  clueTokens: number,
) {
  // Some "Detrimental Characters" are able to perform two actions
  if (characterID !== null) {
    const character = CHARACTERS.get(characterID);
    if (character === undefined) {
      throw new Error(`Unable to find the character corresponding to ID ${characterID}.`);
    }

    if (character.name === 'Panicky' && clueTokens <= 4) {
      return cardsPlayedOrDiscardedThisTurn === 2;
    }
  }

  // Otherwise, the turn always increments when:
  // 1) a play or discard happens and
  // 2) a card is drawn
  return cardsPlayedOrDiscardedThisTurn === 1;
}

export function shouldEndTurnAfterClue(
  cluesGivenThisTurn: number,
  characterID: number | null,
) {
  // Some "Detrimental Characters" are able to perform two clues
  if (characterID !== null) {
    const character = CHARACTERS.get(characterID);
    if (character === undefined) {
      throw new Error(`Unable to find the character corresponding to ID ${characterID}.`);
    }

    if (character.name === 'Genius') {
      return cluesGivenThisTurn === 2;
    }
  }

  // Otherwise, the turn always increments when a clue is given
  return true;
}

export function shouldTurnsInvert(characterID: number | null) {
  // Some "Detrimental Characters" are able to invert the turns
  if (characterID !== null) {
    const character = CHARACTERS.get(characterID);
    if (character === undefined) {
      throw new Error(`Unable to find the character corresponding to ID ${characterID}.`);
    }

    if (character.name === 'Contrarian') {
      return true;
    }
  }

  return false;
}

export function getNextPlayerIndex(
  currentPlayerIndex: number,
  numPlayers: number,
  turnsInverted: boolean,
) {
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
}
