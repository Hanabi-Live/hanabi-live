// TODO: implement d.Discord, d.Username

import type { ClientCommandChatData } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { validateAndNormalizeChatMsg } from "../chat";
import { chatMessageToWire } from "../chatMessage";
import type { ChatTarget } from "../chatTarget";
import { parseChatTarget } from "../chatTarget";
import { getCurrentDatetime } from "../date";
import { identityTokenRegenerate } from "../identityToken";
import { logger } from "../logger";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

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
    wsWarning(wsUser.connection, "That is not a valid room");
    return;
  }

  if (
    normalizedMsg.startsWith("/")
    && (await chatToken(wsUser, normalizedMsg, room))
  ) {
    return;
  }

  const sanitizedMsg = escapeHTMLCharacters(normalizedMsg);
  await chat(wsUser, normalizedMsg, sanitizedMsg, target, false);
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
    wsSendServerPM(wsUser, "The format of the /token command is: /token", room);
    return true;
  }

  try {
    const regenerated = await identityTokenRegenerate(wsUser.userID);
    wsSendServerPM(
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

function wsSendServerPM(wsUser: WSUser, msg: string, room: string) {
  wsSend(
    wsUser.connection,
    ServerCommand.chat,
    chatMessageToWire({
      kind: "notice",
      source: "server",
      text: msg,
      who: "Hanab Live",
      datetime: getCurrentDatetime(),
      room,
      recipient: wsUser.username,
    }),
  );
}

// eslint-disable-next-line @typescript-eslint/require-await
async function chat(
  wsUser: WSUser,
  _normalizedMsg: string,
  sanitizedMsg: string,
  target: ChatTarget,
  discord: boolean,
) {
  const { username } = wsUser;

  const discordPrefix = discord ? "D" : "";
  const room = target.kind === "lobby" ? "lobby" : `table${target.tableID}`;
  logger.info(`#${room} ${discordPrefix}<${username}> ${sanitizedMsg}`);

  if (target.kind === "table") {
    chatTable();
  } else {
    chatLobby();
  }
}

function chatTable() {
  // TODO
}

function chatLobby() {
  // TODO
}
