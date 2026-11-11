import type { z } from "zod";
import { VALID_PLAYER_INDEXES } from "../constants.js";
import type { playerIndexSchema } from "../generated/protocol.js";

/** The maximum number of players in a game is 6. Thus, the valid player indexes are 0 through 5. */
export type PlayerIndex = z.infer<typeof playerIndexSchema>;

export function isValidPlayerIndex(value: unknown): value is PlayerIndex {
  return VALID_PLAYER_INDEXES.includes(value as PlayerIndex);
}
