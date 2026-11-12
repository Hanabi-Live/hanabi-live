import type { ClientCommand } from "@hanabi-live/data";
import {
  CLIENT_REPLY_SCHEMAS,
  SERVER_COMMAND_SCHEMAS,
  unpackServerFrame,
} from "@hanabi-live/data";
import { z } from "zod";

const schemas: Readonly<Record<string, z.ZodType | undefined>> =
  SERVER_COMMAND_SCHEMAS;

const replySchemas: Readonly<Partial<Record<ClientCommand, z.ZodType>>> =
  CLIENT_REPLY_SCHEMAS;

/**
 * Checks a WebSocket frame from the server against the schemas the clients parse it with, so tests
 * fail when the server and the clients disagree about a message. `requestCommand` names the command
 * of a request by its ID, so that a reply's data can be checked. Returns a description of the
 * problem, or undefined if the frame is valid.
 */
export function serverFrameViolation(
  frame: string,
  requestCommand: (id: number) => ClientCommand | undefined = () => undefined,
): string | undefined {
  const unpacked = unpackServerFrame(frame);
  if (unpacked === undefined) {
    return `The server sent a frame that is neither a message nor a reply: ${frame}`;
  }
  if (unpacked.kind === "reply") {
    if (unpacked.error !== undefined) {
      if (unpacked.data !== undefined) {
        return `The server sent a failed reply with data: ${frame}`;
      }
      const result = SERVER_COMMAND_SCHEMAS.warning.safeParse(unpacked.error);
      return result.success
        ? undefined
        : `The server sent an invalid failure:\n${z.prettifyError(result.error)}`;
    }
    const command = requestCommand(unpacked.id);
    if (command === undefined) {
      return undefined;
    }
    const schema = replySchemas[command];
    if (schema === undefined) {
      return unpacked.data === undefined
        ? undefined
        : `The server sent data in the reply to "${command}", which has none.`;
    }
    const result = schema.safeParse(unpacked.data);
    return result.success
      ? undefined
      : `The server sent an invalid reply to "${command}":\n${z.prettifyError(result.error)}`;
  }
  const schema = schemas[unpacked.name];
  if (schema === undefined) {
    return `The server sent "${unpacked.name}", which the clients do not handle.`;
  }
  const result = schema.safeParse(unpacked.data);
  return result.success
    ? undefined
    : `The server sent an invalid "${unpacked.name}":\n${z.prettifyError(result.error)}`;
}
