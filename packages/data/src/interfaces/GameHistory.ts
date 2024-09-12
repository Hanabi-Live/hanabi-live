import { EndCondition, options } from "@hanabi-live/game";
import { z } from "zod";
import { gameID } from "../types/GameID";

export const gameHistory = z
  .object({
    id: gameID,
    options,
    seed: z.string(),
    score: z.number().int(),
    numTurns: z.number().int(),
    endCondition: z.nativeEnum(EndCondition),
    datetimeStarted: z.date(),
    datetimeFinished: z.date(),
    numGamesOnThisSeed: z.number().int(),
    playerNames: z.string().array().readonly(),
    incrementNumGames: z.boolean(),
    tags: z.string(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameHistory extends z.infer<typeof gameHistory> {}
