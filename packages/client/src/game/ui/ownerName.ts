import type { UserId } from "@hanabi-live/data";
import { getOnlineUsername } from "../../onlineUsers.ts";
import { globals } from "./UiGlobals.ts";

/**
 * The name of a table's owner: our own, a spectator's at this table, or else an online user's. The
 * owner of a shared replay watches it, so only an owner who just lost their connection is unknown.
 */
export function getOwnerName(ownerId: UserId): string | undefined {
  if (ownerId === globals.lobby.userId) {
    return globals.lobby.username;
  }
  const spectator = globals.store
    ?.getState()
    .spectators.find((value) => value.userId === ownerId);
  return spectator?.username ?? getOnlineUsername(ownerId);
}
