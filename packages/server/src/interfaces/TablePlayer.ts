import { userID } from "@hanabi/data";
import z from "zod";

const pregameStats = z
  .object({
    numGames: z.number().int(),
  })
  .strict();

export const tablePlayer = z
  .object({
    userID,
    name: z.string().min(1),
    present: z.boolean(),
    stats: pregameStats,
    typing: z.boolean(),
    lastTyped: z.date(),
    voteToKill: z.boolean(),
  })
  .strict();
