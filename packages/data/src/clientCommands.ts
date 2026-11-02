// ----------------
// Data definitions
// ----------------

import { interfaceSatisfiesEnum } from "complete-common";
import { z } from "zod";
import { ClientCommand } from "./enums/ClientCommand";

const clientCommandChatData = z
  .object({
    msg: z.string().min(1),
    room: z.string().min(1),
    requestID: z.string().max(128).optional(),
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

export interface ClientCommandData {
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
}

interfaceSatisfiesEnum<ClientCommandData, ClientCommand>();

export const CLIENT_COMMAND_SCHEMAS = {
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
} as const satisfies Record<ClientCommand, unknown>;
