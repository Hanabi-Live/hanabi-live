import { userID } from "@hanabi-live/data";
import { playerIndex } from "@hanabi-live/game";
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerSpectator extends z.infer<typeof serverSpectator> {}
