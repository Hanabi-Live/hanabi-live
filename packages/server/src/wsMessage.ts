import type { ClientCommandData } from "@hanabi/data";
import {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  unpackWSMessage,
} from "@hanabi/data";
import { ReadonlySet, getEnumValues, isEnumValue } from "isaacscript-common-ts";
import type { RawData } from "ws";
import { commandChat } from "./commands/commandChat";
import { commandChatPM } from "./commands/commandChatPM";
import { logger } from "./logger";
import { wsError } from "./wsHelpers";
import type { WSUser } from "./wsUsers";

const CLIENT_COMMANDS_SET = new ReadonlySet(getEnumValues(ClientCommand));

type ClientCommandHandlers = {
  [Value in ClientCommand]: (
    wsUser: WSUser,
    data: ClientCommandData[Value],
  ) => Promise<void>;
};

const CLIENT_COMMAND_HANDLERS = {
  [ClientCommand.chat]: commandChat,
  [ClientCommand.chatPM]: commandChatPM,
} as const satisfies ClientCommandHandlers;

let blockIncomingWebSocketMessages = false;
let numWSMessages = 0;

export async function wsMessage(
  wsUser: WSUser,
  rawData: RawData,
): Promise<void> {
  if (blockIncomingWebSocketMessages) {
    return;
  }

  numWSMessages++;

  try {
    await handleWSMessage(wsUser, rawData);
  } finally {
    numWSMessages--;
  }
}

async function handleWSMessage(wsUser: WSUser, rawData: RawData) {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const rawDataString = rawData.toString();
  const msg = unpackWSMessage(rawDataString);
  if (msg === undefined) {
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

  const schema = CLIENT_COMMAND_SCHEMAS[command];
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.error(
      `Received a WebSocket command of "${command}" with invalid data: ${result.error}`,
    );
    return;
  }

  const func = CLIENT_COMMAND_HANDLERS[command];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  await func(wsUser, result.data as any);
}

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setBlockIncomingWebSocketMessages() {
  blockIncomingWebSocketMessages = true;
}

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getNumWSMessages() {
  return numWSMessages;
}
