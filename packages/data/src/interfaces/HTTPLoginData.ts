import { z } from "zod";

export const httpLoginData = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
    newPassword: z.string().min(1).optional(),
    version: z.string().min(1),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HTTPLoginData extends z.infer<typeof httpLoginData> {}
