import { z } from "zod";
import { userID } from "../../UserID";

export const commandUserLeftData = z
  .object({
    userID,
  })
  .readonly();

export type CommandUserLeftData = z.infer<typeof commandUserLeftData>;
