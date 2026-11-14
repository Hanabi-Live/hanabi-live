import type { ServerEventData, UserId } from "@hanabi-live/data";
import { selectOnlineUsers } from "./lobby/users/usersSlice.ts";
import { store } from "./store.ts";

/** The names of the online users, bots included. */
export function getOnlineUsernames(): readonly string[] {
  return selectOnlineUsers(store.getState()).map((user) => user.username);
}

/** An online user, from their name in any case. */
export function findOnlineUser(
  username: string,
): ServerEventData["user"] | undefined {
  const name = username.toLowerCase();
  return selectOnlineUsers(store.getState()).find(
    (user) => user.username.toLowerCase() === name,
  );
}

/** The ID of an online user, from their name in any case. */
export function getOnlineUserId(username: string): UserId | undefined {
  return findOnlineUser(username)?.userId;
}
