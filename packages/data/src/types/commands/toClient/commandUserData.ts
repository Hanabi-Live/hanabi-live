import { z } from "zod";
import { Status } from "../../../enums/Status";
import { tableID } from "../../TableID";
import { userID } from "../../UserID";

export const commandUserData = z
  .object({
    userID,
    name: z.string(),
    status: z.nativeEnum(Status),
    tableID: tableID.optional(),
    hyphenated: z.boolean(),
    inactive: z.boolean(),
  })
  .readonly();

export type CommandUserData = z.infer<typeof commandUserData>;
