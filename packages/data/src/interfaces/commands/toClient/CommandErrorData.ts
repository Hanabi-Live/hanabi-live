import { z } from "zod";

export const CommandErrorDataSchema = z
  .object({
    error: z.string(),
  })
  .readonly();

export type CommandErrorData = z.infer<typeof CommandErrorDataSchema>;
