import { z } from "zod";

export const CommandWarningDataSchema = z
  .object({
    warning: z.string(),
  })
  .readonly();

export type CommandWarningData = z.infer<typeof CommandWarningDataSchema>;
