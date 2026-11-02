import type { ClientCommandData } from "@hanabi-live/data";
import {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  unpackWSMessage,
} from "@hanabi-live/data";
import { ReadonlySet, getEnumValues, isEnumValue } from "complete-common";
import type { RawData } from "ws";
import type { z } from "zod";
import { incomingCommands } from "./commandAdmission";
import { commandChat } from "./commands/commandChat";
import { commandChatPM } from "./commands/commandChatPM";
import { commandChatPMHistoryGet } from "./commands/commandChatPMHistoryGet";
import {
  commandAction,
  commandGetGameInfo1,
  commandGetGameInfo2,
  commandLoaded,
  commandNote,
  commandPause,
  commandReplayAction,
  commandTableSpectate,
  commandTableStart,
  commandTableUnattend,
  commandTag,
} from "./commands/commandGame";
import { commandGetName } from "./commands/commandGetName";
import {
  commandHistoryFriendsGet,
  commandHistoryGet,
  commandHistoryGetSeed,
} from "./commands/commandHistory";
import { commandInactive } from "./commands/commandInactive";
import {
  commandChatFriend,
  commandChatLink,
  commandChatLinked,
  commandChatPlayerInfo,
  commandChatUnfriend,
  commandChatUnlink,
} from "./commands/commandRelationships";
import { commandSetting } from "./commands/commandSetting";
import {
  commandTableCreate,
  commandTableJoin,
  commandTableLeave,
  commandTableReattend,
  commandTableSetLeader,
  commandTableSetVariant,
  commandTableTerminate,
  commandTableUpdate,
} from "./commands/commandTable";
import { logger } from "./logger";
import { wsError, wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

const CLIENT_COMMANDS_SET = new ReadonlySet(getEnumValues(ClientCommand));

const CLIENT_COMMAND_HANDLERS = {
  [ClientCommand.tableStart]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableStart,
    commandTableStart,
  ),
  [ClientCommand.getGameInfo1]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.getGameInfo1,
    commandGetGameInfo1,
  ),
  [ClientCommand.getGameInfo2]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.getGameInfo2,
    commandGetGameInfo2,
  ),
  [ClientCommand.loaded]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.loaded,
    commandLoaded,
  ),
  [ClientCommand.action]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.action,
    commandAction,
  ),
  [ClientCommand.pause]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.pause,
    commandPause,
  ),
  [ClientCommand.note]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.note,
    commandNote,
  ),
  [ClientCommand.tag]: validatedHandler(CLIENT_COMMAND_SCHEMAS.tag, commandTag),
  [ClientCommand.tableUnattend]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableUnattend,
    commandTableUnattend,
  ),
  [ClientCommand.tableSpectate]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableSpectate,
    commandTableSpectate,
  ),
  [ClientCommand.replayAction]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.replayAction,
    commandReplayAction,
  ),
  [ClientCommand.tableReattend]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableReattend,
    commandTableReattend,
  ),
  [ClientCommand.tableCreate]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableCreate,
    commandTableCreate,
  ),
  [ClientCommand.tableJoin]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableJoin,
    commandTableJoin,
  ),
  [ClientCommand.tableLeave]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableLeave,
    commandTableLeave,
  ),
  [ClientCommand.tableSetLeader]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableSetLeader,
    commandTableSetLeader,
  ),
  [ClientCommand.tableSetVariant]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableSetVariant,
    commandTableSetVariant,
  ),
  [ClientCommand.tableTerminate]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableTerminate,
    commandTableTerminate,
  ),
  [ClientCommand.tableUpdate]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.tableUpdate,
    commandTableUpdate,
  ),
  [ClientCommand.chat]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chat,
    commandChat,
  ),
  [ClientCommand.chatFriend]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatFriend,
    commandChatFriend,
  ),
  [ClientCommand.chatLink]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatLink,
    commandChatLink,
  ),
  [ClientCommand.chatLinked]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatLinked,
    commandChatLinked,
  ),
  [ClientCommand.chatPlayerInfo]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatPlayerInfo,
    commandChatPlayerInfo,
  ),
  [ClientCommand.chatPM]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatPM,
    commandChatPM,
  ),
  [ClientCommand.chatPMHistoryGet]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatPMHistoryGet,
    commandChatPMHistoryGet,
  ),
  [ClientCommand.chatUnfriend]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatUnfriend,
    commandChatUnfriend,
  ),
  [ClientCommand.chatUnlink]: validatedHandler(
    CLIENT_COMMAND_SCHEMAS.chatUnlink,
    commandChatUnlink,
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
  const admitted = await incomingCommands.run(async () => {
    await dispatchMessage(wsUser, rawData);
  });
  if (!admitted && wsUsers.get(wsUser.userID) === wsUser) {
    wsWarning(wsUser.connection, "The server is draining for maintenance.");
  }
}

async function dispatchMessage(wsUser: WSUser, rawData: RawData) {
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
