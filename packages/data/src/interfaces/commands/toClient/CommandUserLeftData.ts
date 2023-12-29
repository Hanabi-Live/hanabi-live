import { z } from "zod";

export const CommandUserLeftDataSchema = z
  .object({
    userID: z.number(),
  })
  .readonly();

export type CommandUserLeftData = z.infer<typeof CommandUserLeftDataSchema>;
