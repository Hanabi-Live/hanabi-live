import { EndCondition, options } from "@hanabi-live/game";
import { z } from "zod";
import { gameID } from "../types/GameID";

// JSON carries dates as strings, so keep them as strings but reject ones that cannot be parsed.
const dateString = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid date");

export const gameHistory = z
  .object({
    id: gameID,
    options,
    seed: z.string(),
    score: z.number().int(),
    numTurns: z.number().int(),
    endCondition: z.enum(EndCondition),
    datetimeStarted: dateString,
    datetimeFinished: dateString,
    numGamesOnThisSeed: z.number().int(),
    playerNames: z.string().array().readonly(),
    incrementNumGames: z.boolean(),
    tags: z.string(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameHistory extends z.infer<typeof gameHistory> {}
