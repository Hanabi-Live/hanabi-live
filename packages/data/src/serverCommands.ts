// Datetime properties are in the form: "2023-12-29T18:21:43.812446Z"

import { options } from "@hanabi/game";
import { interfaceSatisfiesEnum } from "isaacscript-common-ts";
import { z } from "zod";
import { ServerCommand } from "./enums/ServerCommand";
import { Status } from "./enums/Status";
import { settings } from "./interfaces/Settings";
import { spectator } from "./interfaces/Spectator";
import { tableID } from "./types/TableID";
import { userID } from "./types/UserID";

// ----------------
// Data definitions
// ----------------

const serverCommandChatData = z
  .object({
    msg: z.string().min(1),
    who: z.string().min(1),
    discord: z.boolean(),
    server: z.boolean(),
    datetime: z.string().min(1),
    room: z.string().min(1).optional(),
    recipient: z.string().min(1).optional(),
  })
  .strict()
  .readonly();

export type ServerCommandChatData = z.infer<typeof serverCommandChatData>;

const serverCommandChatListData = serverCommandChatData.array().readonly();

type ServerCommandChatListData = z.infer<typeof serverCommandChatListData>;

const serverCommandErrorData = z
  .object({
    error: z.string().min(1),
  })
  .strict()
  .readonly();

type ServerCommandErrorData = z.infer<typeof serverCommandErrorData>;

const serverCommandTableData = z
  .object({
    id: tableID,
    joined: z.boolean(),
    maxPlayers: z.number().int(),
    name: z.string().min(1),
    numPlayers: z.number().int(),
    options,
    owned: z.boolean(),
    passwordProtected: z.boolean(),
    players: z.string().min(1).array(),
    progress: z.number().int(),
    running: z.boolean(),
    sharedReplay: z.boolean(),
    spectators: spectator.array().readonly(),
    timeBase: z.number(),
    timePerTurn: z.number().int(),
    timed: z.boolean(),
    variant: z.string().min(1),
  })
  .strict()
  .readonly();

export type ServerCommandTableData = z.infer<typeof serverCommandTableData>;

const serverCommandTableListData = serverCommandTableData.array().readonly();

type ServerCommandTableListData = z.infer<typeof serverCommandTableListData>;

const serverCommandUserData = z
  .object({
    userID,
    name: z.string().min(1),
    status: z.nativeEnum(Status),
    tableID: tableID.optional(),
    hyphenated: z.boolean(),
    inactive: z.boolean(),
  })
  .strict()
  .readonly();

export type ServerCommandUserData = z.infer<typeof serverCommandUserData>;

const serverCommandUserLeftData = z
  .object({
    userID,
  })
  .strict()
  .readonly();

export type ServerCommandUserLeftData = z.infer<
  typeof serverCommandUserLeftData
>;

const serverCommandUserListData = serverCommandUserData.array().readonly();

export type ServerCommandUserListData = z.infer<
  typeof serverCommandUserListData
>;

const serverCommandWarningData = z
  .object({
    warning: z.string().min(1),
  })
  .strict()
  .readonly();

type ServerCommandWarningData = z.infer<typeof serverCommandWarningData>;

const serverCommandWelcomeData = z
  .object({
    userID,
    username: z.string().min(1),
    totalGames: z.number().int(),
    muted: z.boolean(),
    firstTimeUser: z.boolean(),
    settings,
    friends: z.string().min(1).array().readonly(),

    playingAtTables: tableID.array().readonly(),
    disconSpectatingTable: tableID.optional(),
    disconShadowingSeat: z.number().int().optional(),

    randomTableName: z.string().min(1),
    shuttingDown: z.boolean(),
    datetimeShutdownInit: z.string().min(1).optional(),
    maintenanceMode: z.boolean(),
  })
  .strict()
  .readonly();

export type ServerCommandWelcomeData = z.infer<typeof serverCommandWelcomeData>;

// -----------
// Collections
// -----------

export interface ServerCommandData {
  [ServerCommand.chat]: ServerCommandChatData;
  [ServerCommand.chatList]: ServerCommandChatListData;
  [ServerCommand.error]: ServerCommandErrorData;
  [ServerCommand.table]: ServerCommandTableData;
  [ServerCommand.tableList]: ServerCommandTableListData;
  [ServerCommand.user]: ServerCommandUserData;
  [ServerCommand.userLeft]: ServerCommandUserLeftData;
  [ServerCommand.userList]: ServerCommandUserListData;
  [ServerCommand.warning]: ServerCommandWarningData;
  [ServerCommand.welcome]: ServerCommandWelcomeData;
}

interfaceSatisfiesEnum<ServerCommandData, ServerCommand>();

export const SERVER_COMMAND_SCHEMAS = {
  [ServerCommand.chat]: serverCommandChatData,
  [ServerCommand.chatList]: serverCommandChatListData,
  [ServerCommand.error]: serverCommandErrorData,
  [ServerCommand.table]: serverCommandTableData,
  [ServerCommand.tableList]: serverCommandTableListData,
  [ServerCommand.user]: serverCommandUserData,
  [ServerCommand.userLeft]: serverCommandUserLeftData,
  [ServerCommand.userList]: serverCommandUserListData,
  [ServerCommand.warning]: serverCommandWarningData,
  [ServerCommand.welcome]: serverCommandWelcomeData,
} as const satisfies Record<ServerCommand, unknown>;
