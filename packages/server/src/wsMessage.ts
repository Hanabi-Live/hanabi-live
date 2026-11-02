import type { ClientCommandData } from "@hanabi-live/data";
import {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  unpackWSMessage,
} from "@hanabi-live/data";
import { ReadonlySet, getEnumValues, isEnumValue } from "complete-common";
import type { RawData } from "ws";
import type { z } from "zod";
import { commandChat } from "./commands/commandChat";
import { commandChatPM } from "./commands/commandChatPM";
import { commandChatPMHistoryGet } from "./commands/commandChatPMHistoryGet";
import { commandGetName } from "./commands/commandGetName";
import {
  commandHistoryFriendsGet,
  commandHistoryGet,
  commandHistoryGetSeed,
} from "./commands/commandHistory";
import { commandInactive } from "./commands/commandInactive";
import { commandSetting } from "./commands/commandSetting";
import { logger } from "./logger";
import { wsError, wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

const CLIENT_COMMANDS_SET = new ReadonlySet(getEnumValues(ClientCommand));

const CLIENT_COMMAND_HANDLERS = {
  [ClientCommand.chat]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chat,
    commandChat,
  ),
  [ClientCommand.chatPM]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatPM,
    commandChatPM,
  ),
  [ClientCommand.chatPMHistoryGet]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatPMHistoryGet,
    commandChatPMHistoryGet,
  ),
  [ClientCommand.getName]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.getName,
    commandGetName,
  ),
  [ClientCommand.historyFriendsGet]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.historyFriendsGet,
    commandHistoryFriendsGet,
  ),
  [ClientCommand.historyGet]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.historyGet,
    commandHistoryGet,
  ),
  [ClientCommand.historyGetSeed]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.historyGetSeed,
    commandHistoryGetSeed,
  ),
  [ClientCommand.inactive]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.inactive,
    commandInactive,
  ),
  [ClientCommand.setting]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.setting,
    commandSetting,
  ),
} as const satisfies Record<
  ClientCommand,
  (wsUser: WSUser, data: unknown) => Promise<void>
>;

function validatedHandler<Data extends ClientCommandData[ClientCommand]>(
  schema: z.ZodType<Data>,
  handler: (wsUser: WSUser, data: Data) => void | Promise<void>,
) {
  return async (wsUser: WSUser, data: unknown): Promise<void> => {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.warn(`Invalid WebSocket command data: ${result.error.message}`);
      wsWarning(wsUser.connection, "Invalid command data.");
      return;
    }
    await handler(wsUser, result.data);
  };
}

export async function wsMessage(
  wsUser: WSUser,
  rawData: RawData,
): Promise<void> {
  if (
    wsUsers.get(wsUser.userID) !== wsUser
    || wsUser.connection.readyState !== wsUser.connection.OPEN
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const rawDataString = rawData.toString();
  const msg = unpackWSMessage(rawDataString);
  if (msg === undefined) {
    wsWarning(wsUser.connection, "Invalid command message.");
    return;
  }

  const [command, data] = msg;

  if (!isEnumValue(command, ClientCommand, CLIENT_COMMANDS_SET)) {
    wsError(
      wsUser.connection,
      `Received a WebSocket message with an unknown command: ${command}`,
    );
    return;
  }

  await CLIENT_COMMAND_HANDLERS[command](wsUser, data);
}
