import type { ServerEventData } from "@hanabi-live/data";

type Chat = ServerEventData["chat"];
type ChatAuthor = Extract<Chat["kind"], { type: "public" }>["author"];

/** The settings that a suggestion to a table's owner applies to the table. */
export type SuggestedSettings =
  ServerEventData["tableSettingsSuggestion"]["settings"];

/** Who wrote a chat message. */
export function chatAuthor(chat: Chat): ChatAuthor {
  return chat.kind.author;
}

/** The name of the person who wrote a chat message, if a person did. */
export function chatAuthorName(chat: Chat): string | undefined {
  const author = chatAuthor(chat);
  return author.type === "server" ? undefined : author.username;
}

/** The user whom a private message is for, if it is not for everyone. */
export function chatRecipient(chat: Chat): string | undefined {
  return chat.kind.type === "private" ? chat.kind.recipient : undefined;
}
