import { z } from "zod";

export const commandChatData = z
  .object({
    msg: z.string(),
    who: z.string(),
    discord: z.boolean(),
    server: z.boolean(),
    datetime: z.string(),
    room: z.string().optional(),
    recipient: z.string(),
  })
  .readonly();

export type CommandChatData = z.infer<typeof commandChatData>;
