import { ReadonlySet } from "complete-common";
import {
  DEFAULT_CARD_RANKS,
  MAX_RANK,
  START_CARD_RANK,
} from "./generated/protocol.js";

/** The suit used to draw cards whose suit is not known. */
export const UNKNOWN_SUIT_NAME = "Unknown";

export const BLACK_SUIT_NAME = "Black";
export const OMNI_SUIT_NAME = "Omni";
export const DARK_OMNI_SUIT_NAME = "Dark Omni";

export const ALL_CARD_RANKS = [...DEFAULT_CARD_RANKS, START_CARD_RANK] as const;

/** Rank clues name the normal ranks. */
export const DEFAULT_CLUE_RANKS = DEFAULT_CARD_RANKS;

/** The odd ranks, which the odd rank clue touches in an Odds and Evens variant. */
export const ODD_CARD_RANKS: ReadonlyArray<
  (typeof DEFAULT_CARD_RANKS)[number]
> = DEFAULT_CARD_RANKS.filter((rank) => rank % 2 === 1);

/** The even ranks, which the even rank clue touches in an Odds and Evens variant. */
export const EVEN_CARD_RANKS: ReadonlyArray<
  (typeof DEFAULT_CARD_RANKS)[number]
> = DEFAULT_CARD_RANKS.filter((rank) => rank % 2 === 0);

/**
 * The amount of cards that need to be played on a play stack in order for it to be considered
 * finished. In a no variant game, this is 5 because we need to play 1, 2, 3, 4, and 5.
 */
export const DEFAULT_FINISHED_STACK_LENGTH = MAX_RANK;

/** The valid amount of players that can be in a game. */
export const VALID_NUM_PLAYERS = [2, 3, 4, 5, 6] as const;

export const VALID_PLAYER_INDEXES = [0, 1, 2, 3, 4, 5] as const;

export const VALID_SUIT_INDEXES = [0, 1, 2, 3, 4, 5] as const;

/**
 * A variant can never have more colors than suits, so we repurpose the existing array.
 *
 * @alias
 */
export const VALID_CLUE_COLOR_INDEXES = VALID_SUIT_INDEXES;

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
