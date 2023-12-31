import { userID } from "@hanabi/data";
import z from "zod";

export const PlayerSchema = z.object({
  userID,
  connected: z.boolean(),
});
