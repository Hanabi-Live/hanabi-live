import type { DEFAULT_CARD_RANKS, START_CARD_RANK } from "../constants";

/** The normal ranks of 1 through 5 and the rank of `START_CARD_RANK`. */
export type Rank = (typeof DEFAULT_CARD_RANKS)[number] | typeof START_CARD_RANK;
