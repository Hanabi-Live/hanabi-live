import type { z } from "zod";
import { DEFAULT_CLUE_RANKS } from "../constants.ts";
import type { clueRankSchema } from "../generated/protocol.ts";

/** The normal ranks of 1 through 5, representing the valid values for rank clues. */
export type ClueRank = z.infer<typeof clueRankSchema>;

export function isValidClueRank(value: unknown): value is ClueRank {
  return DEFAULT_CLUE_RANKS.includes(value as ClueRank);
}
