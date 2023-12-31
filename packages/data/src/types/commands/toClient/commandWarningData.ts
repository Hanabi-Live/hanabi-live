import { z } from "zod";

export const commandWarningData = z
  .object({
    warning: z.string(),
  })
  .readonly();

export type CommandWarningData = z.infer<typeof commandWarningData>;
