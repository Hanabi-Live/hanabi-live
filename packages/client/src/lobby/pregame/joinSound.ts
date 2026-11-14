// Decides when a pre-game table plays the "someone joined" sound to its players.

import type { UserId } from "@hanabi-live/data";
import type { Game } from "./pregameSlice.ts";

/** A join within this time of the last one does not play the sound again. */
const JOIN_SOUND_INTERVAL_MILLISECONDS = 15_000;

/** When a player last joined the table that we see, or when we first saw the table. */
let lastJoin: { tableId: number; time: number } | undefined;

/**
 * Whether a change to a pre-game table should play the join sound for us: another player joined, we
 * are a player at the table, and no one joined in the last `JOIN_SOUND_INTERVAL_MILLISECONDS`. The
 * first message about a table, such as when we create or join it, plays no sound.
 */
export function shouldPlayJoinSound(
  previous: Game | undefined,
  next: Game,
  ourUserId: UserId | undefined,
  now: number,
): boolean {
  if (
    previous?.tableId !== next.tableId
    || lastJoin?.tableId !== next.tableId
  ) {
    lastJoin = {
      tableId: next.tableId,
      time: now,
    };
    return false;
  }
  const previousIds = new Set(previous.players.map((player) => player.userId));
  const joined = next.players.some(
    (player) => player.userId !== ourUserId && !previousIds.has(player.userId),
  );
  if (!joined) {
    return false;
  }
  const seated = next.players.some((player) => player.userId === ourUserId);
  const quiet = now - lastJoin.time > JOIN_SOUND_INTERVAL_MILLISECONDS;
  lastJoin = {
    tableId: next.tableId,
    time: now,
  };
  return seated && quiet;
}
