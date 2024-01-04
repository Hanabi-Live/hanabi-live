import { z } from "zod";
import { DEFAULT_CLUE_RANKS } from "../constants";

export const rankClueNumber = z.custom<RankClueNumber>(isValidRankClueNumber);

/** The normal ranks of 1 through 5, representing the valid values for rank clues. */
export type RankClueNumber = (typeof DEFAULT_CLUE_RANKS)[number];

export function isValidRankClueNumber(value: unknown): value is RankClueNumber {
  return DEFAULT_CLUE_RANKS.includes(value as RankClueNumber);
}
