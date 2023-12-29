import type { SocketStream } from "@fastify/websocket";
import { ReadonlyMap } from "isaacscript-common-ts";
import type { SessionID } from "./types/SessionID";
import type { UserID } from "./types/UserID";

export interface WSUser {
  /** We need to store the `SocketStream` instead of the `WebSocket` for destruction purposes. */
  connection: SocketStream;

  sessionID: SessionID;
  userID: UserID;
  username: string;
  ip: string;
}

/**
 * Contains the currently connected WebSocket users.
 *
 * Should only be written to by functions inside of the WebSocket queue.
 */
export const wsUsers = new ReadonlyMap<UserID, WSUser>();

/**
 * The first session will be given an ID of 1, the second session will be given an ID of 2, and so
 * on.
 */
let sessionID = 0 as SessionID;

export function getSessionID(): SessionID {
  sessionID++;
  return sessionID;
}
