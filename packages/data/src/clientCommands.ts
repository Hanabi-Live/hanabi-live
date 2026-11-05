import {
  chatRequestSchema as clientCommandChatData,
  chatLinkedRequestSchema as clientCommandChatLinkedData,
  chatPmRequestSchema as clientCommandChatPMData,
  chatHistoryRequestSchema as clientCommandChatPMHistoryGetData,
  chatUserRequestSchema as clientCommandChatUserData,
  tableRequestSchema as clientCommandTableData,
  tableJoinRequestSchema as clientCommandTableJoinData,
  tableLeaderRequestSchema as clientCommandTableSetLeaderData,
  tableVariantRequestSchema as clientCommandTableSetVariantData,
} from "./generated/protocol";
// ----------------
// Data definitions
// ----------------

import { options } from "@hanabi-live/game";
import { interfaceSatisfiesEnum } from "complete-common";
import { z } from "zod";
import { ClientCommand } from "./enums/ClientCommand";
import type { GameClientCommandData } from "./gameCommands";
import { GAME_CLIENT_COMMAND_SCHEMAS } from "./gameCommands";
import { tableID } from "./types/TableID";

const tableOptions = options.unwrap().extend({
  variantName: z.string().default("No Variant"),
  startingPlayer: z.number().int().default(0),
  timeBase: z.number().int().default(0),
});
const tableCreationFields = {
  name: z.string().default(""),
  options: tableOptions.prefault({}),
  password: z.string().default(""),
  maxPlayers: z.number().int().default(5),
  hidePregame: z.boolean().default(false),
  gameJSON: z.unknown().optional(),
};
const clientCommandTableCreateData = z.strictObject(tableCreationFields);
const clientCommandTableUpdateData = z.strictObject({
  ...tableCreationFields,
  tableID,
});

const clientCommandTagSearchData = z.strictObject({
  msg: z.string().default(""),
  room: z.string().default(""),
});

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatData extends z.infer<
  typeof clientCommandChatData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatPMData extends z.infer<
  typeof clientCommandChatPMData
> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatPMHistoryGetData extends z.infer<
  typeof clientCommandChatPMHistoryGetData
> {}

const clientCommandGetNameData = z.strictObject({}).optional();

const clientCommandHistoryData = z
  .strictObject({
    offset: z.number().int().default(0),
    amount: z.number().int().default(0),
  })
  .readonly();
const clientCommandHistoryGetSeedData = z
  .strictObject({
    seed: z.string(),
    friends: z.boolean().default(false),
  })
  .readonly();
const clientCommandInactiveData = z
  .strictObject({ inactive: z.boolean() })
  .readonly();
const clientCommandSettingData = z
  .strictObject({ name: z.string(), setting: z.string() })
  .readonly();

// -----------
// Collections
// -----------

export interface ClientCommandData extends GameClientCommandData {
  [ClientCommand.chatRead]: z.infer<typeof clientCommandTableData>;
  [ClientCommand.chatTyping]: z.infer<typeof clientCommandTableData>;
  [ClientCommand.tagSearch]: z.infer<typeof clientCommandTagSearchData>;
  [ClientCommand.chat]: ClientCommandChatData;
  [ClientCommand.chatFriend]: z.infer<typeof clientCommandChatUserData>;
  [ClientCommand.chatLink]: z.infer<typeof clientCommandChatUserData>;
  [ClientCommand.chatLinked]: z.infer<typeof clientCommandChatLinkedData>;
  [ClientCommand.chatPlayerInfo]: z.infer<typeof clientCommandChatUserData>;
  [ClientCommand.chatPM]: ClientCommandChatPMData;
  [ClientCommand.chatPMHistoryGet]: ClientCommandChatPMHistoryGetData;
  [ClientCommand.chatUnfriend]: z.infer<typeof clientCommandChatUserData>;
  [ClientCommand.chatUnlink]: z.infer<typeof clientCommandChatUserData>;
  [ClientCommand.getName]: z.infer<typeof clientCommandGetNameData>;
  [ClientCommand.historyFriendsGet]: z.infer<typeof clientCommandHistoryData>;
  [ClientCommand.historyGet]: z.infer<typeof clientCommandHistoryData>;
  [ClientCommand.historyGetSeed]: z.infer<
    typeof clientCommandHistoryGetSeedData
  >;
  [ClientCommand.inactive]: z.infer<typeof clientCommandInactiveData>;
  [ClientCommand.setting]: z.infer<typeof clientCommandSettingData>;
  [ClientCommand.tableCreate]: z.infer<typeof clientCommandTableCreateData>;
  [ClientCommand.tableJoin]: z.infer<typeof clientCommandTableJoinData>;
  [ClientCommand.tableLeave]: z.infer<typeof clientCommandTableData>;
  [ClientCommand.tableReattend]: z.infer<typeof clientCommandTableData>;
  [ClientCommand.tableSetLeader]: z.infer<
    typeof clientCommandTableSetLeaderData
  >;
  [ClientCommand.tableSetVariant]: z.infer<
    typeof clientCommandTableSetVariantData
  >;
  [ClientCommand.tableTerminate]: z.infer<
    typeof GAME_CLIENT_COMMAND_SCHEMAS.loaded
  >;
  [ClientCommand.tableUpdate]: z.infer<typeof clientCommandTableUpdateData>;
}

interfaceSatisfiesEnum<ClientCommandData, ClientCommand>();

export const CLIENT_COMMAND_SCHEMAS = {
  [ClientCommand.chatRead]: clientCommandTableData,
  [ClientCommand.chatTyping]: clientCommandTableData,
  [ClientCommand.tagSearch]: clientCommandTagSearchData,
  ...GAME_CLIENT_COMMAND_SCHEMAS,
  [ClientCommand.chat]: clientCommandChatData,
  [ClientCommand.chatFriend]: clientCommandChatUserData,
  [ClientCommand.chatLink]: clientCommandChatUserData,
  [ClientCommand.chatLinked]: clientCommandChatLinkedData,
  [ClientCommand.chatPlayerInfo]: clientCommandChatUserData,
  [ClientCommand.chatPM]: clientCommandChatPMData,
  [ClientCommand.chatPMHistoryGet]: clientCommandChatPMHistoryGetData,
  [ClientCommand.chatUnfriend]: clientCommandChatUserData,
  [ClientCommand.chatUnlink]: clientCommandChatUserData,
  [ClientCommand.getName]: clientCommandGetNameData,
  [ClientCommand.historyFriendsGet]: clientCommandHistoryData,
  [ClientCommand.historyGet]: clientCommandHistoryData,
  [ClientCommand.historyGetSeed]: clientCommandHistoryGetSeedData,
  [ClientCommand.inactive]: clientCommandInactiveData,
  [ClientCommand.setting]: clientCommandSettingData,
  [ClientCommand.tableCreate]: clientCommandTableCreateData,
  [ClientCommand.tableJoin]: clientCommandTableJoinData,
  [ClientCommand.tableLeave]: clientCommandTableData,
  [ClientCommand.tableReattend]: clientCommandTableData,
  [ClientCommand.tableSetLeader]: clientCommandTableSetLeaderData,
  [ClientCommand.tableSetVariant]: clientCommandTableSetVariantData,
  [ClientCommand.tableTerminate]: GAME_CLIENT_COMMAND_SCHEMAS.loaded,
  [ClientCommand.tableUpdate]: clientCommandTableUpdateData,
} as const satisfies Record<ClientCommand, unknown>;
