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
const clientCommandTableData = z.strictObject({ tableID });
const clientCommandTableJoinData = z.strictObject({
  tableID,
  password: z.string().default(""),
});
const clientCommandTableSetLeaderData = z.strictObject({
  tableID,
  name: z.string().default(""),
});
const clientCommandTableSetVariantData = z.strictObject({
  tableID,
  options: z.strictObject({ variantName: z.string().default("") }).prefault({}),
});

const clientCommandChatData = z
  .object({
    msg: z.string().min(1),
    room: z.string().min(1),
    requestID: GAME_CLIENT_COMMAND_SCHEMAS.loaded.shape.requestID,
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatData extends z.infer<
  typeof clientCommandChatData
> {}

const clientCommandChatPMData = z
  .object({
    msg: z.string().min(1),
    recipient: z.string().min(1),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatPMData extends z.infer<
  typeof clientCommandChatPMData
> {}

const clientCommandChatPMHistoryGetData = z
  .object({
    amount: z.number().int().default(0),
    beforeID: z.number().int().optional(),
    room: z.string().optional(),
    username: z.string().optional(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatPMHistoryGetData extends z.infer<
  typeof clientCommandChatPMHistoryGetData
> {}

const clientCommandGetNameData = z.strictObject({}).optional();
const clientCommandChatUserData = z
  .strictObject({
    name: z.string().default(""),
    room: z.string().default(""),
  })
  .readonly()
  .default({ name: "", room: "" });
const clientCommandChatLinkedData = z
  .strictObject({ room: z.string().default("") })
  .readonly()
  .default({ room: "" });
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
