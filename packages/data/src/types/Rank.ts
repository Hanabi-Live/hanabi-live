import { DEFAULT_CARD_RANKS, START_CARD_RANK } from "../constants";

/**
 * The normal ranks of 1 through 5 and the rank of `START_CARD_RANK`.
 *
 * If this is updated, remember to also update the `isValidRank` function.
 */
export type Rank = (typeof DEFAULT_CARD_RANKS)[number] | typeof START_CARD_RANK;

export function isValidRank(rank: Rank): boolean {
  return DEFAULT_CARD_RANKS.includes(rank) || rank === START_CARD_RANK;
}
