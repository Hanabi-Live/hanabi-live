// Datetime properties are in the form: "2023-12-29T18:21:43.812446Z"

import { options } from "@hanabi-live/game";
import { interfaceSatisfiesEnum } from "complete-common";
import { z } from "zod";
import { ServerCommand } from "./enums/ServerCommand";
import { Status } from "./enums/Status";
import { gameHistory } from "./interfaces/GameHistory";
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
    who: z.string().min(1).optional(),
    discord: z.boolean(),
    server: z.boolean(),
    datetime: z.string().min(1),
    room: z.string().min(1).optional(),
    recipient: z.string().min(1).optional(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandChatData extends z.infer<
  typeof serverCommandChatData
> {}

const serverCommandChatListData = z
  .object({
    list: serverCommandChatData.array().readonly(),
    unread: z.number().int(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ServerCommandChatListData extends z.infer<
  typeof serverCommandChatListData
> {}

const serverCommandErrorData = z
  .object({
    error: z.string().min(1),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandErrorData extends z.infer<
  typeof serverCommandErrorData
> {}

export const serverCommandGameHistoryData = gameHistory.array().readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ServerCommandGameHistoryData extends z.infer<
  typeof serverCommandGameHistoryData
> {}

const serverCommandTableData = z
  .object({
    id: tableID,
    joined: z.boolean(),
    maxPlayers: z.number().int(),
    name: z.string().min(1),
    numPlayers: z.number().int(),
    options,
    ownerID: userID,
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandTableData extends z.infer<
  typeof serverCommandTableData
> {}

const serverCommandTableListData = serverCommandTableData.array().readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ServerCommandTableListData extends z.infer<
  typeof serverCommandTableListData
> {}

const serverCommandUserData = z
  .object({
    userID,
    name: z.string().min(1),
    status: z.enum(Status),
    tableID: tableID.optional(),
    hyphenated: z.boolean(),
    inactive: z.boolean(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandUserData extends z.infer<
  typeof serverCommandUserData
> {}

const serverCommandUserLeftData = z
  .object({
    userID,
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandUserLeftData extends z.infer<
  typeof serverCommandUserLeftData
> {}

const serverCommandUserListData = serverCommandUserData.array().readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandUserListData extends z.infer<
  typeof serverCommandUserListData
> {}

const serverCommandWarningData = z
  .object({
    warning: z.string().min(1),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandWarningData extends z.infer<
  typeof serverCommandWarningData
> {}

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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandWelcomeData extends z.infer<
  typeof serverCommandWelcomeData
> {}

// -----------
// Collections
// -----------

export interface ServerCommandData {
  [ServerCommand.chat]: ServerCommandChatData;
  [ServerCommand.chatList]: ServerCommandChatListData;
  [ServerCommand.error]: ServerCommandErrorData;
  [ServerCommand.gameHistory]: ServerCommandGameHistoryData;
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
  [ServerCommand.gameHistory]: serverCommandGameHistoryData,
  [ServerCommand.table]: serverCommandTableData,
  [ServerCommand.tableList]: serverCommandTableListData,
  [ServerCommand.user]: serverCommandUserData,
  [ServerCommand.userLeft]: serverCommandUserLeftData,
  [ServerCommand.userList]: serverCommandUserListData,
  [ServerCommand.warning]: serverCommandWarningData,
  [ServerCommand.welcome]: serverCommandWelcomeData,
} as const satisfies Record<ServerCommand, unknown>;
