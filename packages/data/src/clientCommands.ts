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
    amount: z.number().int().min(1).max(100),
    beforeID: z.number().int().positive().optional(),
    room: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
  })
  .strict()
  .readonly();

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientCommandChatPMHistoryGetData extends z.infer<
  typeof clientCommandChatPMHistoryGetData
> {}

// -----------
// Collections
// -----------

export interface ClientCommandData {
  [ClientCommand.chat]: ClientCommandChatData;
  [ClientCommand.chatPM]: ClientCommandChatPMData;
  [ClientCommand.chatPMHistoryGet]: ClientCommandChatPMHistoryGetData;
}

interfaceSatisfiesEnum<ClientCommandData, ClientCommand>();

export const CLIENT_COMMAND_SCHEMAS = {
  [ClientCommand.chat]: clientCommandChatData,
  [ClientCommand.chatPM]: clientCommandChatPMData,
  [ClientCommand.chatPMHistoryGet]: clientCommandChatPMHistoryGetData,
} as const satisfies Record<ClientCommand, unknown>;
