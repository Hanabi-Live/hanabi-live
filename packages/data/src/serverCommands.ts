import type {
  chatHistoryMessageSchema as serverCommandChatPMHistoryMessageData,
  ServerWireData,
} from "./generated/protocol";
import {
  emptySchema,
  lobbyStatusSchema as lobbyStatus,
  restartSchema,
  SERVER_WIRE_SCHEMAS,
  chatSchema as serverCommandChatData,
  chatDeleteSchema as serverCommandChatDeleteData,
  chatListSchema as serverCommandChatListData,
  chatHistorySchema as serverCommandChatPMHistoryData,
  chatTypingSchema as serverCommandChatTypingData,
  tableRequestSchema as serverCommandTableIDData,
} from "./generated/protocol";
// Datetime properties are in the form: "2023-12-29T18:21:43.812446Z"

import { options } from "@hanabi-live/game";
import { interfaceSatisfiesEnum } from "complete-common";
import { z } from "zod";
import { ServerCommand } from "./enums/ServerCommand";
import type { GameServerCommandData } from "./gameCommands";
import { GAME_SERVER_COMMAND_SCHEMAS } from "./gameCommands";
import { gameHistory } from "./interfaces/GameHistory";
import { spectator } from "./interfaces/Spectator";
import { tableID } from "./types/TableID";
import { userID } from "./types/UserID";

// ----------------
// Data definitions
// ----------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandChatData extends z.infer<
  typeof serverCommandChatData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandChatDeleteData extends z.infer<
  typeof serverCommandChatDeleteData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ServerCommandChatListData extends z.infer<
  typeof serverCommandChatListData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandChatPMHistoryMessageData extends z.infer<
  typeof serverCommandChatPMHistoryMessageData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerCommandChatPMHistoryData extends z.infer<
  typeof serverCommandChatPMHistoryData
> {}

const pregameVariantStats = z.strictObject({
  numGames: z.number().int(),
  bestScores: z
    .strictObject({
      numPlayers: z.number().int(),
      score: z.number().int(),
      modifier: z.number().int(),
      deckPlays: z.boolean(),
      emptyClues: z.boolean(),
      oneExtraCard: z.boolean(),
      oneLessCard: z.boolean(),
      allOrNothing: z.boolean(),
    })
    .array(),
});
const pregameStats = z.strictObject({
  numGames: z.number().int(),
  variant: pregameVariantStats,
});
const serverCommandGameData = z.strictObject({
  tableID,
  name: z.string(),
  owner: userID,
  players: z
    .strictObject({
      index: z.number().int(),
      name: z.string(),
      you: z.boolean(),
      present: z.boolean(),
      stats: pregameStats,
    })
    .array(),
  options,
  passwordProtected: z.boolean(),
  maxPlayers: z.number().int(),
});

const serverCommandSpectatorsData = z.strictObject({
  tableID,
  spectators: spectator.array(),
});

export const serverCommandGameHistoryData = gameHistory.array().readonly();

const serverCommandGameHistoryOtherScoresData = z
  .strictObject({
    games: serverCommandGameHistoryData,
    variantName: z.string().min(1),
    seed: z.string().min(1),
  })
  .readonly();

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

export type ServerCommandWelcomeData = ServerWireData["welcome"];

// -----------
// Collections
// -----------

export type ServerCommandErrorData = ServerWireData["error"];
export type ServerCommandUserData = ServerWireData["user"];
export type ServerCommandUserLeftData = ServerWireData["userLeft"];
export type ServerCommandUserListData = ServerWireData["userList"];
export type ServerCommandWarningData = ServerWireData["warning"];

export interface ServerCommandData extends GameServerCommandData {
  [ServerCommand.restart]: z.infer<typeof restartSchema>;
  [ServerCommand.lobbyStatus]: z.infer<typeof lobbyStatus>;
  [ServerCommand.chatTyping]: z.infer<typeof serverCommandChatTypingData>;
  [ServerCommand.soundLobby]: ServerWireData["soundLobby"];
  [ServerCommand.chat]: ServerCommandChatData;
  [ServerCommand.chatDelete]: ServerCommandChatDeleteData;
  [ServerCommand.chatList]: ServerCommandChatListData;
  [ServerCommand.chatPMHistory]: ServerCommandChatPMHistoryData;
  [ServerCommand.error]: ServerCommandErrorData;
  [ServerCommand.friends]: ServerWireData["friends"];
  [ServerCommand.game]: z.infer<typeof serverCommandGameData>;
  [ServerCommand.joined]: z.infer<typeof serverCommandTableIDData>;
  [ServerCommand.left]: z.infer<typeof serverCommandTableIDData>;
  [ServerCommand.spectators]: z.infer<typeof serverCommandSpectatorsData>;
  [ServerCommand.tableGone]: z.infer<typeof serverCommandTableIDData>;
  [ServerCommand.gameHistory]: ServerCommandGameHistoryData;
  [ServerCommand.gameHistoryOtherScores]: z.infer<
    typeof serverCommandGameHistoryOtherScoresData
  >;
  [ServerCommand.synced]: z.infer<typeof emptySchema>;
  [ServerCommand.table]: ServerCommandTableData;
  [ServerCommand.tableList]: ServerCommandTableListData;
  [ServerCommand.user]: ServerCommandUserData;
  [ServerCommand.userInactive]: ServerWireData["userInactive"];
  [ServerCommand.userLeft]: ServerCommandUserLeftData;
  [ServerCommand.userList]: ServerCommandUserListData;
  [ServerCommand.warning]: ServerCommandWarningData;
  [ServerCommand.welcome]: ServerCommandWelcomeData;
}

interfaceSatisfiesEnum<ServerCommandData, ServerCommand>();

export const SERVER_COMMAND_SCHEMAS = {
  [ServerCommand.restart]: restartSchema,
  [ServerCommand.lobbyStatus]: lobbyStatus,
  [ServerCommand.chatTyping]: serverCommandChatTypingData,
  ...GAME_SERVER_COMMAND_SCHEMAS,
  [ServerCommand.soundLobby]: SERVER_WIRE_SCHEMAS.soundLobby,
  [ServerCommand.chat]: serverCommandChatData,
  [ServerCommand.chatDelete]: serverCommandChatDeleteData,
  [ServerCommand.chatList]: serverCommandChatListData,
  [ServerCommand.chatPMHistory]: serverCommandChatPMHistoryData,
  [ServerCommand.error]: SERVER_WIRE_SCHEMAS.error,
  [ServerCommand.friends]: SERVER_WIRE_SCHEMAS.friends,
  [ServerCommand.game]: serverCommandGameData,
  [ServerCommand.joined]: serverCommandTableIDData,
  [ServerCommand.left]: serverCommandTableIDData,
  [ServerCommand.spectators]: serverCommandSpectatorsData,
  [ServerCommand.tableGone]: serverCommandTableIDData,
  [ServerCommand.gameHistory]: serverCommandGameHistoryData,
  [ServerCommand.gameHistoryOtherScores]:
    serverCommandGameHistoryOtherScoresData,
  [ServerCommand.synced]: emptySchema,
  [ServerCommand.table]: serverCommandTableData,
  [ServerCommand.tableList]: serverCommandTableListData,
  [ServerCommand.user]: SERVER_WIRE_SCHEMAS.user,
  [ServerCommand.userInactive]: SERVER_WIRE_SCHEMAS.userInactive,
  [ServerCommand.userLeft]: SERVER_WIRE_SCHEMAS.userLeft,
  [ServerCommand.userList]: SERVER_WIRE_SCHEMAS.userList,
  [ServerCommand.warning]: SERVER_WIRE_SCHEMAS.warning,
  [ServerCommand.welcome]: SERVER_WIRE_SCHEMAS.welcome,
} as const satisfies Record<ServerCommand, unknown>;
