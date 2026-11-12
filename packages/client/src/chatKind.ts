import type { ServerCommandData } from "@hanabi-live/data";

type Chat = ServerCommandData["chat"];
type ChatAuthor = Extract<Chat["kind"], { type: "public" }>["author"];

/** The settings that a suggestion to a table's owner applies to the table. */
export type SuggestedSettings = Extract<
  Chat["kind"],
  { type: "settingsSuggestion" }
>["settings"];

/** Who wrote a chat message. The server writes suggestions. */
export function chatAuthor(chat: Chat): ChatAuthor {
  return chat.kind.type === "settingsSuggestion"
    ? { type: "server" }
    : chat.kind.author;
}

/** The name of the person who wrote a chat message, if a person did. */
export function chatAuthorName(chat: Chat): string | undefined {
  const author = chatAuthor(chat);
  return author.type === "server" ? undefined : author.username;
}

/** The user whom a private message or a suggestion is for, if it is not for everyone. */
export function chatRecipient(chat: Chat): string | undefined {
  return chat.kind.type === "public" ? undefined : chat.kind.recipient;
}

/** The settings that a suggestion applies, if the message is one. */
export function chatSuggestion(chat: Chat): SuggestedSettings | undefined {
  return chat.kind.type === "settingsSuggestion"
    ? chat.kind.settings
    : undefined;
}
