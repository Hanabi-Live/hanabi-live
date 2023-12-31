import { z } from "zod";

export const commandErrorData = z
  .object({
    error: z.string(),
  })
  .readonly();

export type CommandErrorData = z.infer<typeof commandErrorData>;
