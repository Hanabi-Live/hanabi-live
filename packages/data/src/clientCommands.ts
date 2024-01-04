// ----------------
// Data definitions
// ----------------

import { interfaceSatisfiesEnum } from "isaacscript-common-ts";
import { z } from "zod";
import { ClientCommand } from "./enums/ClientCommand";

const clientCommandChatPMData = z
  .object({
    msg: z.string().min(1),
    recipient: z.string().min(1),
  })
  .strict()
  .readonly();

export type ClientCommandChatPMData = z.infer<typeof clientCommandChatPMData>;

// -----------
// Collections
// -----------

export interface ClientCommandData {
  [ClientCommand.chatPM]: ClientCommandChatPMData;
}

interfaceSatisfiesEnum<ClientCommandData, ClientCommand>();

export const CLIENT_COMMAND_SCHEMAS = {
  [ClientCommand.chatPM]: clientCommandChatPMData,
} as const satisfies Record<ClientCommand, unknown>;
