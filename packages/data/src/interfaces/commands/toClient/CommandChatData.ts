import { z } from "zod";

export const CommandChatDataSchema = z
  .object({
    msg: z.string(),
    who: z.string(),
    discord: z.boolean(),
    server: z.boolean(),

    /**
     * Equivalent to `time.Now()` in Golang.
     * e.g. "2023-12-31T13:46:05.221899736Z"
     */
    datetime: z.string(),

    room: z.string().optional(),
    recipient: z.string(),
  })
  .readonly();

export type CommandChatData = z.infer<typeof CommandChatDataSchema>;
