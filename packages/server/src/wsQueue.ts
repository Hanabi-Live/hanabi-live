// We handle all WebSocket logins and logouts using a queue to prevent race conditions.

import type { Settings } from "@hanabi/data";
import { Command } from "@hanabi/data";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { enqueueSetPlayerConnected } from "./gameQueue";
import { logger } from "./logger";
import { models } from "./models";
import { getRedisGamesWithUser } from "./redis";
import type { UserID } from "./types/UserID";
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

interface LoginData {
  // Data that will be attached to the session.
  muted: boolean;
  friends: Set<UserID>;
  reverseFriends: Set<UserID>;
  hyphenated: boolean;

  // Other stats.
  firstTimeUser: boolean;
  totalGames: number;
  settings: Settings;
  friendsList: string[];

  // Information about their current activity.
  playingAtTables: number[];
  disconSpectatingTable: number;
  disconShadowingSeat: number;
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
  const { userID, username, ip } = wsUser;

  logger.info(`Logging in WebSocket user: ${username} (${userID})`);

  // Do all asynchronous work first before adding the user to the map and attaching handlers.
  const data = await getLoginData(userID, ip);

  // The rest must be done synchronously to prevent race conditions.
  addToMapAndAddConnectionHandlers(wsUser, data);
}

async function getLoginData(userID: UserID, ip: string): Promise<LoginData> {
  // Update the database with "datetime_last_login" and "last_ip".
  await models.users.setLastLogin(userID, ip);

  // TODO

  return {} as LoginData; // TODO
}

function addToMapAndAddConnectionHandlers(wsUser: WSUser, _data: LoginData) {
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

  // We perform a type assertion to a readable map to represent that we are inside of the WebSocket
  // login queue, which is the only place that this map should be mutable.
  (wsUsers as Map<UserID, WSUser>).set(userID, wsUser);

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
