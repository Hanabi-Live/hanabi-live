import type { SocketStream } from "@fastify/websocket";
import type { ServerCommandData } from "@hanabi/data";
import {
  ServerCommand,
  packWSMessageOnServer,
  serverCommandSchemas,
} from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import type { ReadonlyRecord } from "isaacscript-common-ts";
import { zodToJsonSchema } from "zod-to-json-schema";
import { wsUsers } from "./wsUsers";

const SERVER_COMMAND_STRINGIFY_FUNCS = Object.fromEntries(
  Object.entries(serverCommandSchemas).map(([key, value]) => {
    const jsonSchema = zodToJsonSchema(value, key) as AnySchema;
    const stringifyFunc = fastJSONStringify(jsonSchema);
    return [key, stringifyFunc];
  }),
) as ReadonlyRecord<ServerCommand, (data: unknown) => string>;

/** Returns a WebSocket message in the Golem protocol format. */
function getWSMsg<T extends ServerCommand>(
  command: T,
  data: ServerCommandData[T],
) {
  const stringifyFunc = SERVER_COMMAND_STRINGIFY_FUNCS[command];
  return packWSMessageOnServer(command, data, stringifyFunc);
}

/**
 * Helper function to send a message to a WebSocket connection.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSend<T extends ServerCommand>(
  connection: SocketStream,
  command: T,
  data: ServerCommandData[T],
): void {
  const msg = getWSMsg(command, data);
  connection.socket.send(msg);
}

/**
 * Helper function to send a message to every currently-connected WebSocket client.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSendAll<T extends ServerCommand>(
  command: T,
  data: ServerCommandData[T],
): void {
  const msg = getWSMsg(command, data);
  for (const wsUser of wsUsers.values()) {
    wsUser.connection.socket.send(msg);
  }
}

/** Helper function to send an error to a WebSocket connection. */
export function wsError(connection: SocketStream, msg: string): void {
  wsSend(connection, ServerCommand.error, {
    error: msg,
  });
}

/** Helper function to send a warning to a WebSocket connection. */
export function wsWarning(connection: SocketStream, msg: string): void {
  wsSend(connection, ServerCommand.warning, {
    warning: msg,
  });
}
