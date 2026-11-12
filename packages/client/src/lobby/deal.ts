// The deal that a new table requests, from the seed and replay fields of a form or a URL.

import type { GameId, ServerEventData } from "@hanabi-live/data";
import { parseIntSafe } from "complete-common";

export type Deal = NonNullable<ServerEventData["table"]["settings"]["deal"]>;

/**
 * A replayed game takes precedence over a seed, since a replay keeps its game's deal. Players count
 * turns from 1, and the server counts them from 0.
 */
export function readDeal(
  seed: string,
  replayGameId: string,
  replayTurn: string,
): Deal | undefined {
  const gameId = parseIntSafe(replayGameId);
  if (gameId !== undefined) {
    const turn = parseIntSafe(replayTurn);
    return {
      type: "replay",
      gameId: gameId as GameId,
      ...(turn !== undefined && { turn: turn - 1 }),
    };
  }
  return seed === "" ? undefined : { type: "seed", suffix: seed };
}
