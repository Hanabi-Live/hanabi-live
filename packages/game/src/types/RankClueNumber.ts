import { DEFAULT_CLUE_RANKS } from "../constants";

/** The normal ranks of 1 through 5, representing the valid values for rank clues. */
export type RankClueNumber = (typeof DEFAULT_CLUE_RANKS)[number];

export function isValidRankClueNumber(clueRank: RankClueNumber): boolean {
  return DEFAULT_CLUE_RANKS.includes(clueRank);
}
