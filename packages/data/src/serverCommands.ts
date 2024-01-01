import { validateInterfaceMatchesEnum } from "isaacscript-common-ts";
import { z } from "zod";
import { Settings } from "./classes/Settings";
import { ServerCommand } from "./enums/ServerCommand";
import { Status } from "./enums/Status";
import { tableID } from "./types/TableID";
import { userID } from "./types/UserID";

// ----------------
// Data definitions
// ----------------

const serverCommandChatData = z
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

export type ServerCommandChatData = z.infer<typeof serverCommandChatData>;

const serverCommandErrorData = z
  .object({
    error: z.string(),
  })
  .readonly();

type ServerCommandErrorData = z.infer<typeof serverCommandErrorData>;

const serverCommandUserData = z
  .object({
    userID,
    name: z.string(),
    status: z.nativeEnum(Status),
    tableID: tableID.optional(),
    hyphenated: z.boolean(),
    inactive: z.boolean(),
  })
  .readonly();

export type ServerCommandUserData = z.infer<typeof serverCommandUserData>;

const serverCommandUserLeftData = z
  .object({
    userID,
  })
  .readonly();

type ServerCommandUserLeftData = z.infer<typeof serverCommandUserLeftData>;

const serverCommandWarningData = z
  .object({
    warning: z.string(),
  })
  .readonly();

type ServerCommandWarningData = z.infer<typeof serverCommandWarningData>;

const serverCommandWelcomeData = z
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

export type ServerCommandWelcomeData = z.infer<typeof serverCommandWelcomeData>;

// -----------
// Collections
// -----------

export interface ServerCommandData {
  [ServerCommand.chat]: ServerCommandChatData;
  [ServerCommand.error]: ServerCommandErrorData;
  [ServerCommand.user]: ServerCommandUserData;
  [ServerCommand.userLeft]: ServerCommandUserLeftData;
  [ServerCommand.warning]: ServerCommandWarningData;
  [ServerCommand.welcome]: ServerCommandWelcomeData;
}

validateInterfaceMatchesEnum<ServerCommandData, ServerCommand>();

export const serverCommandSchemas = {
  [ServerCommand.chat]: serverCommandChatData,
  [ServerCommand.error]: serverCommandErrorData,
  [ServerCommand.user]: serverCommandUserData,
  [ServerCommand.userLeft]: serverCommandUserLeftData,
  [ServerCommand.warning]: serverCommandWarningData,
  [ServerCommand.welcome]: serverCommandWelcomeData,
} as const satisfies Record<ServerCommand, unknown>;
