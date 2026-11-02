import type { ClientCommandChatData, TableID } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { chatServerSendPM, validateAndNormalizeChatMsg } from "../chat";
import { chatMessageToWire } from "../chatMessage";
import { parseChatTarget } from "../chatTarget";
import { identityTokenRegenerate } from "../identityToken";
import { logger } from "../logger";
import { models } from "../models";
import { wsSendAll, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { commandTableChat } from "./commandGame";

export async function commandChat(
  wsUser: WSUser,
  data: ClientCommandChatData,
): Promise<void> {
  const { connection, muted } = wsUser;
  const { msg, room } = data;

  if (muted) {
    wsWarning(connection, "You have been muted by an administrator.");
    return;
  }

  const normalizedMsg = validateAndNormalizeChatMsg(connection, msg);
  if (normalizedMsg === undefined) {
    return;
  }

  const target = parseChatTarget(room);
  if (target === undefined) {
    wsWarning(wsUser.connection, "That is not a valid room.");
    return;
  }

  if (
    normalizedMsg.startsWith("/")
    && (await chatToken(wsUser, normalizedMsg, room))
  ) {
    return;
  }

  if (normalizedMsg.startsWith("/")) {
    wsWarning(
      connection,
      "This chat command is not implemented in the TypeScript server yet.",
    );
    return;
  }
  const sanitizedMsg = escapeHTMLCharacters(normalizedMsg);
  if (target.kind === "table") {
    await commandTableChat(
      wsUser,
      target.tableID as TableID,
      sanitizedMsg,
      data.requestID,
    );
    return;
  }
  const { chatID, datetimeSent } = await models.chatLog.insert(
    wsUser.userID,
    sanitizedMsg,
    "lobby",
  );
  logger.info(`#lobby <${wsUser.username}> ${sanitizedMsg}`);
  wsSendAll(
    ServerCommand.chat,
    chatMessageToWire({
      kind: "lobby",
      source: "user",
      text: sanitizedMsg,
      who: wsUser.username,
      datetime: datetimeSent.toISOString(),
      room: "lobby",
      chatID,
    }),
  );
}

async function chatToken(
  wsUser: WSUser,
  msg: string,
  room: string,
): Promise<boolean> {
  const [command, ...args] = msg.trim().split(/\s+/u);
  if (command?.toLowerCase() !== "/token") {
    return false;
  }

  if (args.length > 0) {
    chatServerSendPM(
      wsUser,
      "The format of the /token command is: /token",
      room,
    );
    return true;
  }

  try {
    const regenerated = await identityTokenRegenerate(wsUser.userID);
    chatServerSendPM(
      wsUser,
      `Identity token (valid until ${regenerated.expiresAt.toISOString()} UTC): <code>${regenerated.token}</code>`,
      room,
    );
  } catch (error) {
    logger.error(
      `Failed to regenerate identity token for user "${wsUser.username}": ${String(error)}`,
    );
    wsWarning(wsUser.connection, "Something went wrong on the server.");
  }

  return true;
}
