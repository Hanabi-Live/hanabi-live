import { z } from "zod";

export const HTTPLoginDataSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
    newPassword: z.string().min(1).optional(),
    version: z.string().min(1),
  })
  .readonly();

export type HTTPLoginData = z.infer<typeof HTTPLoginDataSchema>;
