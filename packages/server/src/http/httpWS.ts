import { Status } from "@hanabi/data";
import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { deleteCookie, getCookieValue } from "../httpSession";
import { models } from "../models";
import { wsError } from "../wsHelpers";
import { WSQueueElementType, enqueueWSMsg } from "../wsQueue";
import type { WSUser } from "../wsUsers";
import { getSessionID } from "../wsUsers";

/**
 * Handles the second part of logic authentication. (The first step is found in "login.ts".)
 *
 * After receiving a cookie in the previous step, the client will attempt to open a WebSocket
 * connection with the cookie. (This is done implicitly because JavaScript will automatically use
 * any current cookies for the website when establishing a WebSocket connection.) So, before
 * allowing anyone to open a WebSocket connection, we need to validate the cookie and the user ID.
 * If the checks pass, we queue the login work (to i.e. send them their game history and so on).
 *
 * @see https://github.com/fastify/fastify-websocket
 */
export async function httpWS(
  connection: WebSocket,
  request: FastifyRequest,
): Promise<void> {
  // If they have a valid cookie, it should have the "userID" value.
  const userID = getCookieValue(request, "userID");
  if (userID === undefined) {
    const msg =
      "You do not have a valid cookie. Please logout and then login again.";
    httpWSError(connection, request, msg);
    return;
  }

  const { ip } = request;
  const wsData = await models.users.getWSData(userID, ip);
  if (wsData === undefined) {
    // The user has a cookie for a user that does not exist in the database (e.g. an "orphaned"
    // user). This can happen in situations where a test user was deleted, for example. Delete their
    // cookie and force them to re-login.
    const msg =
      "You have a cookie that belongs to an orphaned account. Please logout and then login again.";
    httpWSError(connection, request, msg);
    return;
  }

  // Record their successful login attempt in the database.
  await models.users.setLastLogin(userID, ip);

  const { username, normalizedUsername, hyphenated, friends, muted } = wsData;

  const wsUser: WSUser = {
    connection,

    sessionID: getSessionID(),
    userID,
    username,
    normalizedUsername,
    ip,
    muted,
    fakeUser: false,

    status: Status.Lobby,
    tableID: undefined,
    friends,
    /// reverseFriends,
    hyphenated,
    inactive: false,
  };

  enqueueWSMsg(WSQueueElementType.Login, wsUser);
}

/**
 * If anything fails in the `httpWS` function, we want to immediately kill the WebSocket connection
 * and delete the user's cookie in order to force them to start authentication from the beginning.
 */
function httpWSError(
  connection: WebSocket,
  request: FastifyRequest,
  msg: string,
) {
  wsError(connection, msg);
  connection.close();
  deleteCookie(request);
}
