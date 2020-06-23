import { DEFAULT_VARIANT_NAME } from './constants';

export default class Options {
  numPlayers: number = 0;
  startingPlayer: number = 0; // Legacy field for games prior to April 2020
  variantName: string = DEFAULT_VARIANT_NAME;
  timed: boolean = false;
  timeBase: number = 0;
  timePerTurn: number = 0;
  speedrun: boolean = false;
  cardCycle: boolean = false;
  deckPlays: boolean = false;
  emptyClues: boolean = false;
  oneExtraCard: boolean = false;
  oneLessCard: boolean = false;
  allOrNothing: boolean = false;
  detrimentalCharacters: boolean = false;
}
