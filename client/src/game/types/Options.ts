import { DEFAULT_VARIANT_NAME } from './constants';

export default class Options {
  startingPlayer: number = 0;
  variant: string = DEFAULT_VARIANT_NAME;
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
