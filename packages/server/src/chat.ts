import type { SocketStream } from "@fastify/websocket";
import {
  escapeHTMLCharacters,
  getNumConsecutiveDiacritics,
  normalizeString,
} from "isaacscript-common-ts";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "./constants";
import { wsWarning } from "./wsHelpers";

const MAX_CHAT_LENGTH = 300;
const MAX_CHAT_LENGTH_SERVER = 600;

/** This both validates and sanitizes a chat message. Returns undefined if validation fails. */
export function sanitizeChatMsg(
  connection: SocketStream,
  msg: string,
  server: boolean,
): string | undefined {
  // Truncate long messages. (We do this first to prevent wasting CPU cycles on validating extremely
  // long messages.)
  const maxLength = server ? MAX_CHAT_LENGTH_SERVER : MAX_CHAT_LENGTH;
  const normalizedMsg = normalizeString(msg, maxLength);

  if (normalizedMsg === "") {
    wsWarning(connection, "Chat messages cannot be blank.");
    return undefined;
  }

  if (
    getNumConsecutiveDiacritics(normalizedMsg) >
    NUM_CONSECUTIVE_DIACRITICS_ALLOWED
  ) {
    wsWarning(
      connection,
      `Chat messages cannot contain more than ${NUM_CONSECUTIVE_DIACRITICS_ALLOWED} consecutive diacritics.`,
    );
    return undefined;
  }

  return escapeHTMLCharacters(msg);
}
