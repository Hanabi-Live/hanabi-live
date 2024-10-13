import { ReadonlySet } from "complete-common";

export const START_CARD_RANK = 7;

export const MAX_CLUE_NUM = 8;
export const MAX_STRIKES = 3;

export const DEFAULT_VARIANT_NAME = "No Variant";
export const DEFAULT_CARD_RANKS = [1, 2, 3, 4, 5] as const;
export const ALL_CARD_RANKS = [...DEFAULT_CARD_RANKS, START_CARD_RANK] as const;
export const DEFAULT_CLUE_RANKS = [1, 2, 3, 4, 5] as const;

/**
 * The amount of cards that need to be played on a play stack in order for it to be considered
 * finished. In a no variant game, this is 5 because we need to play 1, 2, 3, 4, and 5.
 */
export const DEFAULT_FINISHED_STACK_LENGTH = 5;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** The valid amount of players that can be in a game. */
export const VALID_NUM_PLAYERS = [2, 3, 4, 5, 6] as const;

export const VALID_PLAYER_INDEXES = [0, 1, 2, 3, 4, 5] as const;

export const MAX_SUITS_IN_A_VARIANT = 6;
export const VALID_SUIT_INDEXES = [0, 1, 2, 3, 4, 5] as const;

/** A variant can never have more colors than suits, so we repurpose the existing array. */
export const VALID_CLUE_COLOR_INDEXES = VALID_SUIT_INDEXES;

const MAX_CARDS_IN_A_SUIT = 10;
export const MAX_CARDS_IN_A_DECK = MAX_CARDS_IN_A_SUIT * MAX_SUITS_IN_A_VARIANT;

export const DEFAULT_PLAYER_NAMES = [
  "Alice",
  "Bob",
  "Cathy",
  "Donald",
  "Emily",
  "Frank",
] as const;

export const SUIT_REVERSED_SUFFIX = " Reversed";

export const SUIT_DELIMITER = "+";
export const SUIT_MODIFIER_DELIMITER = ":";
export const REVERSE_MODIFIER = "R";
export const SUIT_MODIFIERS = new ReadonlySet(REVERSE_MODIFIER);
export const VARIANT_DELIMITER = ",";
