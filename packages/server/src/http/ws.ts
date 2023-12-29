import type { SocketStream } from "@fastify/websocket";
import type { FastifyRequest } from "fastify";
import { getCookieValue } from "../httpSession";
import { models } from "../models";
import type { WSUser } from "../ws";
import { wsError } from "../ws";
import { WSQueueElementType, enqueueWSMsg } from "../wsQueue";

/**
 * Handles the second part of logic authentication. (The first step is found in "login.ts".)
 *
 * After receiving a cookie in the previous step, the client will attempt to open a WebSocket
 * connection with the cookie. (This is done implicitly because JavaScript will automatically use
 * any current cookies for the website when establishing a WebSocket connection.) So, before
 * allowing anyone to open a WebSocket connection, we need to validate that they have a valid
 * cookie. We also do some other checks to be thorough. If all of the checks pass, the WebSocket
 * connection will be established, and then the user's website data will be initialized in
 * "websocketConnect.ts". If anything fails in this function, we want to delete the user's cookie in
 * order to force them to start authentication from the beginning.
 */
export async function httpWS(
  connection: SocketStream,
  request: FastifyRequest,
): Promise<void> {
  // If they have a valid cookie, it should have the "userID" value.
  const userID = getCookieValue(request, "userID");
  if (userID === undefined) {
    const msg =
      "You do not have a valid cookie. Please logout and then login again.";
    wsError(connection, msg);
    connection.destroy();
    return;
  }

  const username = await models.users.getUsername(userID);
  if (username === undefined) {
    // The user has a cookie for a user that does not exist in the database (e.g. an "orphaned"
    // user). This can happen in situations where a test user was deleted, for example. Delete their
    // cookie and force them to re-login.
    const msg =
      "You have a cookie that belongs to an orphaned account. Please logout and then login again.";
    wsError(connection, msg);
    connection.destroy();
    return;
  }

  // Validation was successful; update the database with "datetime_last_login" and "last_ip".
  await models.users.setLastLogin(userID, request.ip);

  const wsUser: WSUser = {
    connection,
    userID,
    username,
  };

  enqueueWSMsg(WSQueueElementType.Login, wsUser);
}
