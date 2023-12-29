// We handle all WebSocket logins and logouts using a queue to prevent race conditions.

import { Command } from "@hanabi/data";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { enqueueSetPlayerConnected } from "./gameQueue";
import { logger } from "./logger";
import { models } from "./models";
import { getRedisGamesWithUser } from "./redis";
import { wsError, wsSendAll } from "./ws";
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
  logger.info(
    `Logging in WebSocket user: ${wsUser.username} (${wsUser.userID})`,
  );

  const { connection, userID, ip } = wsUser;

  // First, check to see if an existing WebSocket connection exists for this user.
  const existingUser = wsUsers.get(userID);
  if (existingUser !== undefined) {
    wsError(
      existingUser.connection,
      "You have logged on from somewhere else, so you have been disconnected here.",
    );
    existingUser.connection.destroy();
  }

  wsUsers.set(userID, wsUser);

  // Validation was successful; update the database with "datetime_last_login" and "last_ip".
  await models.users.setLastLogin(userID, ip);

  // Attach event handlers.
  connection.socket.on("close", () => {
    enqueueWSMsg(WSQueueElementType.Logout, wsUser);
  });
  // TODO: attach more event handlers

  // TODO: everything from "websocket_connect.go"
}

async function logout(wsUser: WSUser) {
  const { userID, username } = wsUser;

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

  logger.info(`Logging out WebSocket user: ${username} (${userID})`);

  wsUsers.delete(userID);

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
