import type { NumPlayers, PlayerIndex } from "@hanabi/data";
import { DEFAULT_VARIANT_NAME } from "@hanabi/data";

export class Options {
  readonly numPlayers: NumPlayers = 2;

  /** Legacy field for games prior to April 2020. */
  readonly startingPlayer: PlayerIndex = 0;

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

  readonly tableName?: string;
  readonly maxPlayers?: number;
}
