// ----------------
// Data definitions
// ----------------

import { interfaceSatisfiesEnum } from "isaacscript-common-ts";
import { z } from "zod";
import { ClientCommand } from "./enums/ClientCommand";

const clientCommandChatData = z
  .object({
    msg: z.string().min(1),
    room: z.string().min(1),
  })
  .strict()
  .readonly();

export interface ClientCommandChatData
  extends z.infer<typeof clientCommandChatData> {}

const clientCommandChatPMData = z
  .object({
    msg: z.string().min(1),
    recipient: z.string().min(1),
  })
  .strict()
  .readonly();

export interface ClientCommandChatPMData
  extends z.infer<typeof clientCommandChatPMData> {}

// -----------
// Collections
// -----------

export interface ClientCommandData {
  [ClientCommand.chat]: ClientCommandChatData;
  [ClientCommand.chatPM]: ClientCommandChatPMData;
}

interfaceSatisfiesEnum<ClientCommandData, ClientCommand>();

export const CLIENT_COMMAND_SCHEMAS = {
  [ClientCommand.chat]: clientCommandChatData,
  [ClientCommand.chatPM]: clientCommandChatPMData,
} as const satisfies Record<ClientCommand, unknown>;
