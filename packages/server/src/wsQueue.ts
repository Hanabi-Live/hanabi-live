// We handle all WebSocket logins and logouts using a queue to prevent race conditions.

import type { UserID } from "@hanabi/data";
import { Command } from "@hanabi/data";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { enqueueSetPlayerConnected } from "./gameQueue";
import { logger } from "./logger";
import { models } from "./models";
import { getRedisGamesWithUser } from "./redis";
import { wsError, wsSendAll } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

export enum WSQueueElementType {
  Login,
  Logout,
}

interface WSQueueElement extends WSUser {
  type: WSQueueElementType;
}

const QUEUE_FUNCTIONS = {
  [WSQueueElementType.Login]: login,
  [WSQueueElementType.Logout]: logout,
} as const satisfies Record<
  WSQueueElementType,
  (wsUser: WSUser) => Promise<void>
>;

const wsQueue: queueAsPromised<WSQueueElement, void> = fastq.promise(
  processQueue,
  1,
);

async function processQueue(element: WSQueueElement) {
  const func = QUEUE_FUNCTIONS[element.type];
  await func(element);
}

async function login(wsUser: WSUser) {
  const {
    connection,
    userID,
    username,
    ip,
    status,
    tableID,
    hyphenated,
    inactive,
  } = wsUser;

  logger.info(
    `Logging in WebSocket user ${username} (${userID}) from IP: ${ip}`,
  );

  // First, check to see if an existing WebSocket connection exists for this user.
  const existingUser = wsUsers.get(userID);
  if (existingUser !== undefined) {
    wsError(
      existingUser.connection,
      "You have logged on from somewhere else, so you have been disconnected here.",
    );
    existingUser.connection.destroy();
  }

  // We perform a type assertion to a readable map to represent that we are inside of the WebSocket
  // login queue, which is the only place that this map should be mutable.
  (wsUsers as Map<UserID, WSUser>).set(userID, wsUser);

  const games = await getRedisGamesWithUser(userID);
  for (const game of games) {
    enqueueSetPlayerConnected(game.id, userID, true);
  }

  wsSendAll(Command.user, {
    userID,
    name: username,
    status,
    tableID,
    /// friends,
    /// reverseFriends,
    hyphenated,
    inactive,
  });

  // Attach event handlers.
  connection.socket.on("close", () => {
    enqueueWSMsg(WSQueueElementType.Logout, wsUser);
  });

  // TODO: attach more event handlers

  // We intentionally do not await the sending of the "welcome" command because we want to do
  // database-intensive work out of the critical path.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  sendInitialWSMessages(wsUser);
}

async function sendInitialWSMessages(wsUser: WSUser) {
  const { userID, ip } = wsUser;

  // Update the database with "datetime_last_login" and "last_ip".
  await models.users.setLastLogin(userID, ip);

  // TODO: rest of "websocket_connect.go"
}

async function logout(wsUser: WSUser) {
  const { userID, username, ip } = wsUser;

  // Check to see if there is a newer WebSocket connection for this user that is already connected.
  // If so, we can skip the logout work. (This check is necessary because when the same user logs in
  // twice, a logout will be triggered for the first connection after the second one has already
  // connected.)
  const existingWSUser = wsUsers.get(userID);
  if (
    existingWSUser !== undefined &&
    existingWSUser.sessionID > wsUser.sessionID
  ) {
    return;
  }

  logger.info(
    `Logging out WebSocket user ${username} (${userID}) from IP: ${ip}`,
  );

  // We perform a type assertion to a readable map to represent that we are inside of the WebSocket
  // login queue, which is the only place that this map should be mutable.
  (wsUsers as Map<UserID, WSUser>).delete(userID);

  const games = await getRedisGamesWithUser(userID);
  for (const game of games) {
    enqueueSetPlayerConnected(game.id, userID, false);
  }

  wsSendAll(Command.userLeft, {
    userID,
  });
}

// ------------------
// Exported functions
// ------------------

export function enqueueWSMsg(type: WSQueueElementType, wsUser: WSUser): void {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  wsQueue.push({
    ...wsUser,
    type,
  });
}
