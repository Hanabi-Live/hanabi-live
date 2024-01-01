// ----------------
// Data definitions
// ----------------

import { validateInterfaceMatchesEnum } from "isaacscript-common-ts";
import { z } from "zod";
import { ClientCommand } from "./enums/ClientCommand";

const clientCommandChatPMData = z
  .object({
    msg: z.string(),
    recipient: z.string(),
  })
  .readonly();

export type ClientCommandChatPMData = z.infer<typeof clientCommandChatPMData>;

// -----------
// Collections
// -----------

export interface ClientCommandData {
  [ClientCommand.chatPM]: ClientCommandChatPMData;
}

validateInterfaceMatchesEnum<ClientCommandData, ClientCommand>();

export const clientCommandSchemas = {
  [ClientCommand.chatPM]: clientCommandChatPMData,
} as const satisfies Record<ClientCommand, unknown>;
