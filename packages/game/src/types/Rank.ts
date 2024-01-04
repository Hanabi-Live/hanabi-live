import { z } from "zod";
import type { DEFAULT_CARD_RANKS } from "../constants";
import { ALL_CARD_RANKS } from "../constants";

/** The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant). */
export type BasicRank = (typeof DEFAULT_CARD_RANKS)[number];

export const rank = z.custom<Rank>((data) =>
  ALL_CARD_RANKS.includes(data as Rank),
);

/**
 * The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant) and the rank
 * of `START_CARD_RANK`.
 */
export type Rank = (typeof ALL_CARD_RANKS)[number];
