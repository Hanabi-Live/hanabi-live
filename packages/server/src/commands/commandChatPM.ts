import type { ClientCommandChatPMData } from "@hanabi/data";
import { ServerCommand } from "@hanabi/data";
import { escapeHTMLCharacters, normalizeUsername } from "isaacscript-common-ts";
import { validateAndNormalizeChatMsg } from "../chat";
import { getCurrentDatetime } from "../date";
import { logger } from "../logger";
import { models } from "../models";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { getWSUserByNormalizedUsername } from "../wsUsers";

export async function commandChatPM(
  wsUser: WSUser,
  data: ClientCommandChatPMData,
): Promise<void> {
  const { connection, normalizedUsername, muted } = wsUser;
  const { msg, recipient } = data;

  if (muted) {
    wsWarning(connection, "You have been muted by an administrator.");
    return;
  }

  const normalizedMsg = validateAndNormalizeChatMsg(connection, msg);
  if (normalizedMsg === undefined) {
    return;
  }

  const sanitizedMsg = escapeHTMLCharacters(normalizedMsg);

  const normalizedRecipient = normalizeUsername(recipient);
  if (normalizedUsername === normalizedRecipient) {
    wsWarning(connection, "You cannot send a private message to yourself.");
    return;
  }

  const wsUserRecipient = getWSUserByNormalizedUsername(normalizedRecipient);
  if (wsUserRecipient === undefined) {
    wsWarning(connection, `User "${recipient}" is not currently online.`);
    return;
  }

  await chatPM(wsUser, wsUserRecipient, sanitizedMsg);
}

async function chatPM(wsUser: WSUser, wsUserRecipient: WSUser, msg: string) {
  logger.info(
    `PM <${wsUser.username}> --> <${wsUserRecipient.username}> ${msg}`,
  );

  // Add the message to the database. (Even though this is the most time intensive part, we want to
  // do it first in case database insertion fails. That way, we will not send "phantom" direct
  // messages.)
  await models.chatLogPM.insert(wsUser.userID, wsUserRecipient.userID, msg);

  const data = {
    msg,
    who: wsUser.username,
    discord: false,
    server: false,
    datetime: getCurrentDatetime(),
    recipient: wsUserRecipient.username,
  };

  // Echo the private message back to the person who sent it.
  wsSend(wsUser.connection, ServerCommand.chat, data);

  // Send the private message to the recipient.
  wsSend(wsUserRecipient.connection, ServerCommand.chat, data);
}
