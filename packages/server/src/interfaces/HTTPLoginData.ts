import { z } from "zod";

export const HTTPLoginDataSchema = z
  .object({
    username: z.string().nonempty(),
    password: z.string().nonempty(),
    newPassword: z.string().optional(),
    version: z.string().nonempty(),
  })
  .readonly();

export type HTTPLoginData = z.infer<typeof HTTPLoginDataSchema>;
