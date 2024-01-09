import { userID } from "@hanabi/data";
import { playerIndex } from "@hanabi/game";
import z from "zod";

export const serverSpectator = z
  .object({
    userID,
    name: z.string().min(1),
    typing: z.boolean(),
    lastTyped: z.date(),

    shadowingPlayerIndex: playerIndex.or(z.literal(-1)).optional(),
    shadowingPlayerUsername: z.string().min(1).optional(),
    shadowingPlayerPregameIndex: playerIndex.optional(),

    notes: z.string().array().readonly(),
  })
  .strict()
  .readonly();

export interface ServerSpectator extends z.infer<typeof serverSpectator> {}
