// We handle all WebSocket logins and logouts using a queue to prevent race conditions.

import { Command } from "@hanabi/data";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { enqueueSetPlayerConnected } from "./gameQueue";
import { getRedisGamesWithUser } from "./redis";
import type { WSUser } from "./ws";
import { wsError, wsSendAll, wsUsers } from "./ws";

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

// eslint-disable-next-line @typescript-eslint/require-await
async function login(wsUser: WSUser) {
  const { connection, userID } = wsUser;

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

  connection.on("close", () => {
    enqueueWSMsg(WSQueueElementType.Logout, wsUser);
  });

  // TODO: attach more event handlers
  // TODO: everything from "websocket_connect.go"
}

async function logout(wsUser: WSUser) {
  const { userID } = wsUser;

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
