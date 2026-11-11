import { SERVER_COMMAND_SCHEMAS, unpackWsMessage } from "@hanabi-live/data";
import { z } from "zod";

const schemas: Readonly<Record<string, z.ZodType | undefined>> =
  SERVER_COMMAND_SCHEMAS;

/**
 * Checks a WebSocket frame from the server against the schemas the clients parse it with, so tests
 * fail when the server and the clients disagree about a message. Returns a description of the
 * problem, or undefined if the frame is valid.
 */
export function serverFrameViolation(frame: string): string | undefined {
  const unpacked = unpackWsMessage(frame);
  if (unpacked === undefined) {
    return "The server sent a frame without a command.";
  }
  const [command, data] = unpacked;
  const schema = schemas[command];
  if (schema === undefined) {
    return `The server sent "${command}", which the clients do not handle.`;
  }
  const result = schema.safeParse(data);
  return result.success
    ? undefined
    : `The server sent an invalid "${command}":\n${z.prettifyError(result.error)}`;
}
