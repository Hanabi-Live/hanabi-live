import { StateOptions } from '../types/GameState';

export default function initialStateOptionsBasic(
  numPlayers: number,
  variantName: string,
): StateOptions {
  return {
    numPlayers,
    startingPlayer: numPlayers,
    variantName,
    cardCycle: false,
    deckPlays: false,
    emptyClues: false,
    oneExtraCard: false,
    oneLessCard: false,
    allOrNothing: false,
    detrimentalCharacters: false,
  };
}
