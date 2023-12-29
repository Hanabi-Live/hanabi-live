import type { SocketStream } from "@fastify/websocket";
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
 * The first session will be given an ID of 1, the second session will be given an ID of 2, and so
 * on.
 */
let sessionID = 0 as SessionID;

export function getSessionID(): SessionID {
  sessionID++;
  return sessionID;
}

/** Contains the currently connected WebSocket users. */
export const wsUsers = new Map<UserID, WSUser>();
