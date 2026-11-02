import type { ClientCommandData } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { chatServerSendPM } from "../chat";
import { models } from "../models";
import { normalizeString } from "../utils";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";

type UserCommandData = ClientCommandData["chatFriend"];

async function lookupUser(wsUser: WSUser, name: string) {
  const found = await models.users.getByNormalizedUsername(
    normalizeString(name),
  );
  if (found === undefined) {
    wsWarning(
      wsUser.connection,
      `The username of "${escapeHTMLCharacters(name)}" does not exist in the database.`,
    );
  }
  return found;
}

async function relationshipTarget(
  wsUser: WSUser,
  data: UserCommandData,
  verb: "friend" | "unfriend" | "link" | "unlink",
) {
  if (data.name === "") {
    wsWarning(
      wsUser.connection,
      `The format of the /${verb} command is: /${verb} [username]`,
    );
    return undefined;
  }
  if (normalizeString(data.name) === normalizeString(wsUser.username)) {
    wsWarning(wsUser.connection, `You cannot ${verb} yourself.`);
    return undefined;
  }
  return await lookupUser(wsUser, data.name);
}

export async function commandChatFriend(
  wsUser: WSUser,
  data: UserCommandData,
): Promise<void> {
  await changeFriend(wsUser, data, true);
}

export async function commandChatUnfriend(
  wsUser: WSUser,
  data: UserCommandData,
): Promise<void> {
  await changeFriend(wsUser, data, false);
}

async function changeFriend(
  wsUser: WSUser,
  data: UserCommandData,
  add: boolean,
) {
  const target = await relationshipTarget(
    wsUser,
    data,
    add ? "friend" : "unfriend",
  );
  if (target === undefined) {
    return;
  }
  const escapedName = escapeHTMLCharacters(data.name);
  const changed = await models.userFriends.set(wsUser.userID, target.id, add);
  if (!changed) {
    wsWarning(
      wsUser.connection,
      add
        ? `"${escapedName}" is already your friend.`
        : `"${escapedName}" is not your friend, so you cannot unfriend them.`,
    );
    return;
  }
  const current = wsUsers.get(wsUser.userID) ?? wsUser;
  if (add) {
    current.friends.add(target.id);
  } else {
    current.friends.delete(target.id);
  }
  const friends = await models.userFriends.getList(wsUser.userID);
  chatServerSendPM(
    wsUser,
    add
      ? `Successfully added "${escapedName}" to your friends list.`
      : `Successfully removed "${escapedName}" from your friends list.`,
    data.room,
  );
  wsSend(wsUser.connection, ServerCommand.friends, { friends });
}

export async function commandChatLink(
  wsUser: WSUser,
  data: UserCommandData,
): Promise<void> {
  await changeLink(wsUser, data, true);
}

export async function commandChatUnlink(
  wsUser: WSUser,
  data: UserCommandData,
): Promise<void> {
  await changeLink(wsUser, data, false);
}

async function changeLink(wsUser: WSUser, data: UserCommandData, add: boolean) {
  const target = await relationshipTarget(
    wsUser,
    data,
    add ? "link" : "unlink",
  );
  if (target === undefined) {
    return;
  }
  const escapedName = escapeHTMLCharacters(data.name);
  const changed = await models.userLinkages.set(wsUser.userID, target.id, add);
  if (!changed) {
    wsWarning(
      wsUser.connection,
      add
        ? `"${escapedName}" is already linked to your account.`
        : `"${escapedName}" is not linked to your account, so you cannot unlink them.`,
    );
    return;
  }
  chatServerSendPM(
    wsUser,
    add
      ? `Successfully added "${escapedName}" to your linked users.`
      : `Successfully removed "${escapedName}" from your linked users.`,
    data.room,
  );
}

export async function commandChatLinked(
  wsUser: WSUser,
  data: ClientCommandData["chatLinked"],
): Promise<void> {
  const names = await models.userLinkages.getList(wsUser.userID);
  const message =
    names.length === 0
      ? "Currently, you do not have any linked accounts."
      : `Currently linked accounts: ${names.map(escapeHTMLCharacters).join(", ")}`;
  chatServerSendPM(wsUser, message, data.room);
}

export async function commandChatPlayerInfo(
  wsUser: WSUser,
  data: ClientCommandData["chatPlayerInfo"],
): Promise<void> {
  const target = await lookupUser(wsUser, data.name);
  if (target === undefined) {
    return;
  }
  const count = await models.games.getNumGamesForUser(target.id, false);
  const href = escapeHTMLCharacters(encodeURIComponent(target.username));
  chatServerSendPM(
    wsUser,
    `"${escapeHTMLCharacters(data.name)}" has played ${count} non-speedrun games. More stats <a href="/scores/${href}" target="_blank" rel="noopener noreferrer">here</a>.`,
    data.room,
  );
}
