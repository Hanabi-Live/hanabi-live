import type { ServerCommandChatData } from "@hanabi-live/data";
import { getNumConsecutiveDiacritics, normalizeString } from "complete-common";
import type { WebSocket } from "ws";
import { chatMessageToWire } from "./chatMessage";
import { NUM_CONSECUTIVE_DIACRITICS_ALLOWED } from "./constants";
import { models } from "./models";
import { truncateToMaxCodeUnits } from "./utils";
import { wsWarning } from "./wsHelpers";

const MAX_CHAT_LENGTH = 300;

/** Returns undefined if validation fails. */
export function validateAndNormalizeChatMsg(
  connection: WebSocket,
  msg: string,
): string | undefined {
  // We truncate first to prevent wasting CPU cycles on validating extremely long messages.
  const truncatedMsg = truncateToMaxCodeUnits(msg, MAX_CHAT_LENGTH);
  const normalizedMsg = normalizeString(truncatedMsg);

  if (normalizedMsg === "") {
    wsWarning(connection, "Chat messages cannot be blank.");
    return undefined;
  }

  if (
    getNumConsecutiveDiacritics(normalizedMsg)
    > NUM_CONSECUTIVE_DIACRITICS_ALLOWED
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
  amount: number,
  beforeID?: number,
): Promise<{ list: readonly ServerCommandChatData[]; hasMore: boolean }> {
  const { rows, hasMore } = await models.chatLog.getHistory(
    room,
    amount,
    beforeID,
  );
  // Pages are selected newest first for the cursor, but rendered oldest first.
  return {
    list: rows.toReversed().map((row) => getChatData(room, row)),
    hasMore,
  };
}

function getChatData(
  room: string,
  row: Awaited<ReturnType<typeof models.chatLog.getHistory>>["rows"][number],
): ServerCommandChatData {
  const {
    chatID,
    userID,
    source,
    username,
    discordName,
    message,
    datetimeSent,
  } = row;

  const msg = message;
  const discord = source === "discord";
  const server = source === "server";
  let who = username ?? `Deleted user #${userID}`;
  if (discord) {
    who = discordName ?? "";
  } else if (server) {
    who = "__server";
  }
  const datetime = datetimeSent.toISOString();

  return chatMessageToWire({
    kind: "lobby",
    source,
    text: msg,
    who,
    datetime,
    room,
    chatID,
  });
}
