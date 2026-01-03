import type { ServerCommandData, UserID } from "@hanabi-live/data";
import {
  SERVER_COMMAND_SCHEMAS,
  ServerCommand,
  packWSMessageOnServer,
} from "@hanabi-live/data";
import type { ReadonlyRecord } from "complete-common";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import type { WebSocket } from "ws";
import { z } from "zod";
import { logger } from "./logger";
import { wsUsers } from "./wsUsers";

const SERVER_COMMAND_STRINGIFY_FUNCS = Object.fromEntries(
  Object.entries(SERVER_COMMAND_SCHEMAS).map(([key, value]) => {
    const jsonSchema = z.toJSONSchema(value) as AnySchema;
    const stringifyFunc = fastJSONStringify(jsonSchema);
    return [key, stringifyFunc];
  }),
) as ReadonlyRecord<ServerCommand, (data: unknown) => string>;

/** Returns a WebSocket message in the Golem protocol format. */
function getWSMsg<T extends ServerCommand>(
  command: T,
  data: ServerCommandData[T],
): string | undefined {
  // First, validate that we are not sending data with excess properties to users. (TypeScript will
  // not generate a compiler error when passing objects with additional properties, so we validate
  // it at run-time with Zod.)
  const schema = SERVER_COMMAND_SCHEMAS[command];
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = JSON.stringify(result.error.issues, undefined, 2);
    logger.error(
      `Failed to parse the data for a "${command}" command before sending it to a user: ${issues}`,
    );
    return undefined;
  }

  const stringifyFunc = SERVER_COMMAND_STRINGIFY_FUNCS[command];
  return packWSMessageOnServer(command, result.data, stringifyFunc);
}

/**
 * Helper function to send a message to a WebSocket connection.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSend<T extends ServerCommand>(
  connection: WebSocket,
  serverCommand: T,
  data: ServerCommandData[T],
): void {
  const msg = getWSMsg(serverCommand, data);
  if (msg !== undefined) {
    connection.send(msg);
  }
}

/**
 * Helper function to send a message to every currently-connected WebSocket client.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSendAll<T extends ServerCommand>(
  serverCommand: T,
  data: ServerCommandData[T],
  exceptionUserID?: UserID,
): void {
  const msg = getWSMsg(serverCommand, data);
  if (msg === undefined) {
    return;
  }

  for (const wsUser of wsUsers.values()) {
    if (exceptionUserID !== wsUser.userID) {
      wsUser.connection.send(msg);
    }
  }
}

/** Helper function to send an error to a WebSocket connection. */
export function wsError(connection: WebSocket, msg: string): void {
  wsSend(connection, ServerCommand.error, {
    error: msg,
  });
}

/** Helper function to send a warning to a WebSocket connection. */
export function wsWarning(connection: WebSocket, msg: string): void {
  wsSend(connection, ServerCommand.warning, {
    warning: msg,
  });
}
