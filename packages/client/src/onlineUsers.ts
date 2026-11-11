import type { UserId } from "@hanabi-live/data";
import { globals } from "./Globals.ts";

/** The name of an online user, from the lobby's user list. */
export function getOnlineUsername(userId: UserId): string | undefined {
  return globals.userMap.get(userId)?.username;
}

/** The ID of an online user, from their name in any case. */
export function getOnlineUserId(username: string): UserId | undefined {
  const name = username.toLowerCase();
  for (const user of globals.userMap.values()) {
    if (user.username.toLowerCase() === name) {
      return user.userId;
    }
  }
  return undefined;
}
