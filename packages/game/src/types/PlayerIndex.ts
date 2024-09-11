import type { ERange } from "complete-common";
import { z } from "zod";
import type { MAX_PLAYERS } from "../constants";
import { VALID_PLAYER_INDEXES } from "../constants";

export const playerIndex = z.custom<PlayerIndex>(isValidPlayerIndex);

/** The maximum number of players in a game is 6. Thus, the valid player indexes are 0 through 5. */
export type PlayerIndex = ERange<0, typeof MAX_PLAYERS>;

export function isValidPlayerIndex(value: unknown): value is PlayerIndex {
  return VALID_PLAYER_INDEXES.includes(value as PlayerIndex);
}
