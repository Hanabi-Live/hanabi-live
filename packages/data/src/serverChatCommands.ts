import { SERVER_CHAT_COMMANDS } from "./generated/protocol.ts";
import CHAT_REPLY_COMMANDS from "./json/chatReplyCommands.json";

/**
 * The names of every chat command that the server runs, without the slash: its own commands and the
 * fixed replies.
 */
export const SERVER_CHAT_COMMAND_NAMES: ReadonlySet<string> = new Set([
  ...SERVER_CHAT_COMMANDS,
  ...CHAT_REPLY_COMMANDS.map((replyCommand) => replyCommand.command),
]);
