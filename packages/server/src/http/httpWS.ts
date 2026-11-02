import { Status } from "@hanabi-live/data";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import type { WebSocket } from "ws";
import { incomingCommands } from "../commandAdmission";
import { isReconnectRequest } from "../connectionMode";
import { deleteCookie, getCookieValue } from "../httpSession";
import { logger } from "../logger";
import { models } from "../models";
import type { SessionID } from "../types/SessionID";
import { wsError } from "../wsHelpers";
import { wsMessage } from "../wsMessage";
import { WSQueueElementType, enqueueWSMsg } from "../wsQueue";
import type { WSUser } from "../wsUsers";
import { getSessionID } from "../wsUsers";

export async function httpWSPreValidation(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (incomingCommands.paused) {
    await reply
      .code(StatusCodes.SERVICE_UNAVAILABLE)
      .send("The server is draining for maintenance.\n");
    return;
  }
  const userID = getCookieValue(request, "userID");
  if (
    userID === undefined
    || (await models.users.getUsername(userID)) === undefined
  ) {
    deleteCookie(request);
    await reply.code(StatusCodes.UNAUTHORIZED).send("Unauthorized\n");
    return;
  }
  await models.users.setLastLogin(userID, request.ip);
}

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
export function httpWS(connection: WebSocket, request: FastifyRequest): void {
  let accepting = true;
  let pending = 0;
  let initializedUser: WSUser | undefined;
  let tail = initializeConnection().catch((error: unknown) => {
    failConnection(error);
    return undefined;
  });

  connection.on("message", (rawData, isBinary) => {
    if (!accepting) {
      return;
    }
    if (isBinary || pending >= 64) {
      accepting = false;
      logger.warn("Closing a WebSocket with invalid or excessive input.");
      wsError(connection, "Invalid or excessive WebSocket input.");
      connection.close(1008);
      return;
    }
    pending++;
    tail = tail
      .then(async (wsUser) => {
        if (wsUser !== undefined) {
          await wsMessage(wsUser, rawData);
        }
        return wsUser;
      })
      .catch((error: unknown) => {
        failConnection(error);
        return undefined;
      })
      .finally(() => {
        pending--;
      });
  });
  connection.on("close", () => {
    accepting = false;
    tail
      .then(async () => {
        if (initializedUser !== undefined) {
          await enqueueWSMsg(WSQueueElementType.Logout, initializedUser);
        }
      })
      .catch((error: unknown) => {
        logger.error(`WebSocket cleanup failed: ${String(error)}`);
      });
  });
  connection.on("error", (error) => {
    accepting = false;
    logger.error(`WebSocket transport failed: ${String(error)}`);
    connection.terminate();
  });

  async function initializeConnection() {
    const sessionID = getSessionID();
    const admitted = await incomingCommands.run(async () => {
      initializedUser = await initialize(connection, request, sessionID);
      if (initializedUser !== undefined) {
        await enqueueWSMsg(WSQueueElementType.Login, initializedUser);
      }
    });
    if (!admitted) {
      accepting = false;
      wsError(connection, "The server is draining for maintenance.");
      connection.close(1012);
    }
    return initializedUser;
  }

  function failConnection(error: unknown) {
    accepting = false;
    logger.error(`WebSocket connection failed: ${String(error)}`);
    wsError(connection, "Something went wrong on the server.");
    connection.close(1011);
  }
}

async function initialize(
  connection: WebSocket,
  request: FastifyRequest,
  sessionID: SessionID,
): Promise<WSUser | undefined> {
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

  const { username, normalizedUsername, hyphenated, friends, muted } = wsData;

  const wsUser: WSUser = {
    connection,

    sessionID,
    userID,
    username,
    normalizedUsername,
    ip,
    muted,
    fakeUser: false,
    reconnect: isReconnectRequest(request.url),

    status: Status.Lobby,
    tableID: undefined,
    friends,
    /// reverseFriends,
    hyphenated,
    inactive: false,
  };

  return wsUser;
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
