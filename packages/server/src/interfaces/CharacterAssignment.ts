import { z } from "zod";

export const characterAssignment = z
  .object({
    name: z.string().min(1),
    metadata: z.number(),
  })
  .strict()
  .readonly();
