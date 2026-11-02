import type { ClientCommandData } from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { models } from "../models";
import { wsSend, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

function validPage(
  wsUser: WSUser,
  data: ClientCommandData["historyGet"],
): boolean {
  if (data.offset < 0) {
    wsWarning(wsUser.connection, "That is not a valid start value.");
    return false;
  }
  if (data.amount < 0) {
    wsWarning(wsUser.connection, "That is not a valid end value.");
    return false;
  }
  return true;
}

export async function commandHistoryGet(
  wsUser: WSUser,
  data: ClientCommandData["historyGet"],
): Promise<void> {
  if (!validPage(wsUser, data)) {
    return;
  }
  const ids = await models.games.getGameIDsForUser(
    wsUser.userID,
    data.offset,
    data.amount,
  );
  const history = await models.games.getHistory(ids);
  wsSend(wsUser.connection, ServerCommand.gameHistory, history);
}

export async function commandHistoryFriendsGet(
  wsUser: WSUser,
  data: ClientCommandData["historyFriendsGet"],
): Promise<void> {
  if (!validPage(wsUser, data)) {
    return;
  }
  const ids = await models.games.getGameIDsForUserFriends(
    wsUser.userID,
    wsUser.friends,
    data.offset,
    data.amount,
  );
  const history = await models.games.getHistory(ids);
  wsSend(wsUser.connection, ServerCommand.gameHistoryFriends, history);
}

export async function commandHistoryGetSeed(
  wsUser: WSUser,
  data: ClientCommandData["historyGetSeed"],
): Promise<void> {
  if (data.seed === "") {
    wsWarning(wsUser.connection, "You must provide a seed.");
    return;
  }
  if (!/^[\u{20}-\u{7E}]+$/u.test(data.seed)) {
    wsWarning(wsUser.connection, "Seeds can only contain ASCII characters.");
    return;
  }
  if (!/^[\d\-A-Za-z]+$/u.test(data.seed)) {
    wsWarning(
      wsUser.connection,
      "Seeds can only contain letters, numbers, and hyphens.",
    );
    return;
  }
  const ids = await models.games.getGameIDsForSeed(data.seed);
  const games = await models.games.getHistory(ids, "seed");
  wsSend(wsUser.connection, ServerCommand.gameHistoryOtherScores, {
    games,
    variantName: games[0]?.options.variantName ?? "n/a",
    friends: data.friends,
    seed: data.seed,
  });
}
