import z from "zod";

export const game = z
  .object({
    datetimeStarted: z.date(),
  })
  .strict();
