import { DEFAULT_VARIANT_NAME } from '../game/types/constants';

export default class Options {
  readonly numPlayers: number = 0;
  readonly startingPlayer: number = 0; // Legacy field for games prior to April 2020
  readonly variantName: string = DEFAULT_VARIANT_NAME;
  readonly timed: boolean = false;
  readonly timeBase: number = 0;
  readonly timePerTurn: number = 0;
  readonly speedrun: boolean = false;
  readonly cardCycle: boolean = false;
  readonly deckPlays: boolean = false;
  readonly emptyClues: boolean = false;
  readonly oneExtraCard: boolean = false;
  readonly oneLessCard: boolean = false;
  readonly allOrNothing: boolean = false;
  readonly detrimentalCharacters: boolean = false;
}
