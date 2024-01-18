// TODO: implement d.Discord, d.Username

import type { ClientCommandChatData } from "@hanabi/data";
import { escapeHTMLCharacters } from "isaacscript-common-ts";
import { validateAndNormalizeChatMsg } from "../chat";
import { logger } from "../logger";
import { wsWarning } from "../wsHelpers";
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

  const sanitizedMsg = escapeHTMLCharacters(normalizedMsg);

  if (room !== "lobby" && !room.startsWith("table")) {
    wsWarning(wsUser.connection, "That is not a valid room");
    return;
  }

  await chat(wsUser, normalizedMsg, sanitizedMsg, room, false);
}

async function chat(
  wsUser: WSUser,
  normalizedMsg: string,
  sanitizedMsg: string,
  room: string,
  discord: boolean,
) {
  const { username } = wsUser;

  const discordPrefix = discord ? "D" : "";
  logger.info(`#${room} ${discordPrefix}<${username}> ${sanitizedMsg}`);

  if (room.startsWith("table")) {
    chatTable();
  } else {
    chatLobby();
  }
}

function chatTable() {}

function chatLobby() {}
