import { z } from "zod";

export const characterAssignment = z
  .object({
    name: z.string(),
    metadata: z.int(),
  })
  .strict()
  .readonly();
