import type { ServerCommandChatData } from "@hanabi/data";
import {
  getNumConsecutiveDiacritics,
  normalizeString,
  truncateString,
} from "complete-common";
import type { WebSocket } from "ws";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "./constants";
import { models } from "./models";
import { wsWarning } from "./wsHelpers";

const MAX_CHAT_LENGTH = 300;

/** Returns undefined if validation fails. */
export function validateAndNormalizeChatMsg(
  connection: WebSocket,
  msg: string,
): string | undefined {
  // We truncate first to prevent wasting CPU cycles on validating extremely long messages.
  const truncatedMSg = truncateString(msg, MAX_CHAT_LENGTH);
  const normalizedMsg = normalizeString(truncatedMSg);

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

  return normalizedMsg;
}

export async function getChatList(
  room: string,
  count?: number,
): Promise<readonly ServerCommandChatData[]> {
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
