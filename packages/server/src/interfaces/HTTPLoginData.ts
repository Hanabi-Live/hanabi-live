import { z } from "zod";

export const HTTPLoginDataSchema = z.object({
  username: z.string(),
  password: z.string(),
  newPassword: z.string(),
  version: z.string(),
}).readonly();

export type HTTPLoginData = z.infer<typeof HTTPLoginDataSchema>;
