import { z } from "zod";
import { Settings } from "../../../classes/Settings";

export const CommandWelcomeDataSchema = z
  .object({
    userID: z.number(),
    username: z.string(),
    totalGames: z.number().int(),
    muted: z.boolean(),
    firstTimeUser: z.boolean(),
    settings: z.instanceof(Settings),
    friends: z.string().array(),

    playingAtTables: z.number().int().array(),
    disconSpectatingTable: z.number().int(),
    disconShadowingSeat: z.number().int(),

    randomTableName: z.string(),
    shuttingDown: z.boolean(),
    datetimeShutdownInit: z.string(),
    maintenanceMode: z.boolean(),
  })
  .readonly();

export type CommandWelcomeData = z.infer<typeof CommandWelcomeDataSchema>;
