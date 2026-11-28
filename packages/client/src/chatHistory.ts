// The server sends the past messages of a chat again after each reconnect. These functions find the
// messages that the chat already shows.

import type { ServerEventData } from "@hanabi-live/data";
import { chatAuthorName, chatRecipient } from "./chatKind.ts";

type Chat = ServerEventData["chat"];

/**
 * Identifies a message by its time, its people, and its text. Not every message has a database ID,
 * such as a message in a table's chat.
 */
export function chatHistoryId(chat: Chat): string {
  return JSON.stringify([
    // The server can write the same time in more than one form.
    Date.parse(chat.sentAt),
    chatAuthorName(chat),
    chatRecipient(chat),
    chat.text,
  ]);
}

/**
 * Returns the messages that the chat does not show yet. `shownIds` holds the ID of each message
 * that it shows. Two messages can have the same ID, so each shown ID skips one message.
 */
export function withoutShown<T extends Chat>(
  messages: readonly T[],
  shownIds: readonly string[],
): readonly T[] {
  const shown = new Map<string, number>();
  for (const id of shownIds) {
    shown.set(id, (shown.get(id) ?? 0) + 1);
  }

  return messages.filter((message) => {
    const id = chatHistoryId(message);
    const count = shown.get(id) ?? 0;
    if (count === 0) {
      return true;
    }
    shown.set(id, count - 1);
    return false;
  });
}
