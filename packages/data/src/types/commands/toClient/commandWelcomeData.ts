import { z } from "zod";
import { Settings } from "../../../classes/Settings";
import { tableID } from "../../TableID";
import { userID } from "../../UserID";

export const commandWelcomeData = z
  .object({
    userID,
    username: z.string(),
    totalGames: z.number().int(),
    muted: z.boolean(),
    firstTimeUser: z.boolean(),
    settings: z.instanceof(Settings),
    friends: z.string().array(),

    playingAtTables: z.number().int().array(),
    disconSpectatingTable: tableID,
    disconShadowingSeat: z.number().int(),

    randomTableName: z.string(),
    shuttingDown: z.boolean(),
    datetimeShutdownInit: z.string(),
    maintenanceMode: z.boolean(),
  })
  .readonly();

export type CommandWelcomeData = z.infer<typeof commandWelcomeData>;
