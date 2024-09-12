import type {
  ServerCommandUserData,
  Status,
  TableID,
  UserID,
} from "@hanabi-live/data";
import { ReadonlyMap } from "complete-common";
import type { WebSocket } from "ws";
import type { SessionID } from "./types/SessionID";

export interface WSUser {
  /** We need to the `WebSocket` for destruction purposes. */
  connection: WebSocket;

  // Static fields
  sessionID: SessionID;
  userID: UserID;
  username: string;
  normalizedUsername: string;
  ip: string;
  muted: boolean; // Users are forcefully disconnected upon being muted, so this is static.
  fakeUser: boolean; // TODO: is this needed?

  // Dynamic fields
  status: Status;
  tableID: TableID | undefined;
  friends: Set<UserID>;
  /// reverseFriends: Set<UserID>;
  hyphenated: boolean;
  inactive: boolean;
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

export function getWSUserByNormalizedUsername(
  normalizedUsername: string,
): WSUser | undefined {
  for (const wsUser of wsUsers.values()) {
    if (wsUser.normalizedUsername === normalizedUsername) {
      return wsUser;
    }
  }

  return undefined;
}

/** For the "user" and "userList" commands. */
export function getUserData(wsUser: WSUser): ServerCommandUserData {
  const { userID, username, status, tableID, hyphenated, inactive } = wsUser;

  return {
    userID,
    name: username,
    status,
    tableID,
    hyphenated,
    inactive,
  };
}

export function getUserList(): readonly ServerCommandUserData[] {
  const userList: ServerCommandUserData[] = [];

  for (const wsUser of wsUsers.values()) {
    const userData = getUserData(wsUser);
    userList.push(userData);
  }

  return userList;
}
