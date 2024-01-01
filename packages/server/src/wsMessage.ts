import type { ClientCommandData } from "@hanabi/data";
import {
  ClientCommand,
  clientCommandSchemas,
  unpackWSMessage,
} from "@hanabi/data";
import { ReadonlySet, getEnumValues, isEnumValue } from "isaacscript-common-ts";
import type { RawData } from "ws";
import { commandChatPM } from "./commands/commandChatPM";
import { logger } from "./logger";
import type { WSUser } from "./wsUsers";

const CLIENT_COMMANDS_SET = new ReadonlySet(getEnumValues(ClientCommand));

const CLIENT_COMMAND_HANDLERS = {
  [ClientCommand.chatPM]: commandChatPM,
} as const satisfies Record<
  ClientCommand,
  (wsUser: WSUser, data: ClientCommandData[ClientCommand]) => Promise<void>
>;

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
    logger.error(
      `Received a WebSocket message with an unknown command: ${command}`,
    );
    return;
  }

  const schema = clientCommandSchemas[command];
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.error(
      `Received a WebSocket command of "${command}" with invalid data: ${result.error}`,
    );
    return;
  }

  const func = CLIENT_COMMAND_HANDLERS[command];

  await func(wsUser, result.data);
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
