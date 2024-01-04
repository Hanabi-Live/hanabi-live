import { z } from "zod";
import { rank } from "../types/Rank";
import { suitIndex } from "../types/SuitIndex";

export const cardIdentity = z
  .object({
    /** `null` represents an unknown suit index. */
    suitIndex: suitIndex.or(z.null()),

    /** `null` represents an unknown rank. */
    rank: rank.or(z.null()),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CardIdentity extends z.infer<typeof cardIdentity> {}
