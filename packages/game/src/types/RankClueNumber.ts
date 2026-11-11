import type { z } from "zod";
import { DEFAULT_CLUE_RANKS } from "../constants.js";
import type { rankClueNumberSchema } from "../generated/protocol.js";

/** The normal ranks of 1 through 5, representing the valid values for rank clues. */
export type RankClueNumber = z.infer<typeof rankClueNumberSchema>;

export function isValidRankClueNumber(value: unknown): value is RankClueNumber {
  return DEFAULT_CLUE_RANKS.includes(value as RankClueNumber);
}
