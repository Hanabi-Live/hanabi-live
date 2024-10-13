import { playerIndex } from "@hanabi-live/game";
import { z } from "zod";

export const spectator = z
  .object({
    name: z.string().min(1),
    shadowingPlayerIndex: playerIndex.or(z.literal(-1)).optional(),
    shadowingPlayerUsername: z.string().min(1).optional(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Spectator extends z.infer<typeof spectator> {}
