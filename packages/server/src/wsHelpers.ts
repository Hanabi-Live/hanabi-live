import type { SocketStream } from "@fastify/websocket";
import { Command, packWSMessageOnServer } from "@hanabi/data";
import type { CommandData } from "./http/commands";
import { commandStringifyFuncs } from "./http/commands";
import { wsUsers } from "./wsUsers";

/** Returns a WebSocket message in the Golem protocol format. */
function getWSMsg<T extends Command>(command: T, data: CommandData[T]) {
  const stringifyFunc = commandStringifyFuncs[command];
  return packWSMessageOnServer(command, data, stringifyFunc);
}

/**
 * Helper function to send a message to a WebSocket connection.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSend<T extends Command>(
  connection: SocketStream,
  command: T,
  data: CommandData[T],
): void {
  const msg = getWSMsg(command, data);
  connection.socket.send(msg);
}

/**
 * Helper function to send a message to every currently-connected WebSocket client.
 *
 * Messages are sent using the Golem protocol.
 */
export function wsSendAll<T extends Command>(
  command: T,
  data: CommandData[T],
): void {
  const msg = getWSMsg(command, data);
  for (const wsUser of wsUsers.values()) {
    wsUser.connection.socket.send(msg);
  }
}

/** Helper function to send an error to a WebSocket connection. */
export function wsError(connection: SocketStream, msg: string): void {
  wsSend(connection, Command.error, {
    error: msg,
  });
}

/** Helper function to send a warning to a WebSocket connection. */
export function wsWarning(connection: SocketStream, msg: string): void {
  wsSend(connection, Command.warning, {
    warning: msg,
  });
}
