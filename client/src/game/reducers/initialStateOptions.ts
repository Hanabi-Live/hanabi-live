import { StateOptions } from '../types/GameState';
import Options from '../types/Options';

export default function initialStateOptions(numPlayers: number, options: Options): StateOptions {
  return {
    numPlayers,
    startingPlayer: options.startingPlayer,
    variantName: options.variantName,
    cardCycle: options.cardCycle,
    deckPlays: options.deckPlays,
    emptyClues: options.emptyClues,
    oneExtraCard: options.oneExtraCard,
    oneLessCard: options.oneLessCard,
    allOrNothing: options.allOrNothing,
    detrimentalCharacters: options.detrimentalCharacters,
  };
}
