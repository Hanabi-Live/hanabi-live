import type { ALL_CARD_RANKS } from "../constants.ts";
import type { DEFAULT_CARD_RANKS } from "../generated/protocol.ts";

/** The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant). */
export type BasicRank = (typeof DEFAULT_CARD_RANKS)[number];

/**
 * The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant) and the rank
 * of `START_CARD_RANK`.
 */
export type Rank = (typeof ALL_CARD_RANKS)[number];
