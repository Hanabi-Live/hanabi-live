import { DEFAULT_VARIANT_NAME } from "../game/types/constants";

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
  readonly tableName?: string;
}

export const OptionIcons = {
  TIMED: "fas fa-clock",
  SPEEDRUN: "fas fa-running",
  CARD_CYCLE: "fas fa-sync-alt",
  DECK_PLAYS: "fas fa-blind",
  EMPTY_CLUES: "fas fa-expand",
  ONE_EXTRA_CARD: "fas fa-plus-circle",
  ONE_LESS_CARD: "fas fa-minus-circle",
  ALL_OR_NOTHING: "fas fa-layer-group",
  DETRIMENTAL_CHARACTERS: "fas fa-flushed",
} as const;
