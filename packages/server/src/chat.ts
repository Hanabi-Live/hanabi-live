import type { SocketStream } from "@fastify/websocket";
import type { ServerCommandChatData } from "@hanabi/data";
import {
  escapeHTMLCharacters,
  getNumConsecutiveDiacritics,
  normalizeString,
} from "isaacscript-common-ts";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "./constants";
import { models } from "./models";
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

export async function getChatList(
  room: string,
  count?: number,
): Promise<ServerCommandChatData[]> {
  const rows = await models.chatLog.get(room, count);

  // The chat messages were queried from the database in order from newest to oldest. We want to
  // send them to the client in the reverse order so that the newest messages display at the bottom.
  const reversedRows = rows.toReversed();

  const chatList: ServerCommandChatData[] = [];
  for (const row of reversedRows) {
    const chatData = getChatData(room, row);
    chatList.push(chatData);
  }

  return chatList;
}

function getChatData(
  room: string,
  row: Awaited<ReturnType<typeof models.chatLog.get>>[number],
): ServerCommandChatData {
  const { username, discordName, message, datetimeSent } = row;

  const msg = message;
  const who = discordName ?? username ?? "";
  const discord = discordName !== null;
  const server = username === null && discordName === null;
  const datetime = datetimeSent.toISOString();

  return {
    msg,
    who,
    discord,
    server,
    datetime,
    room,
  };
}
