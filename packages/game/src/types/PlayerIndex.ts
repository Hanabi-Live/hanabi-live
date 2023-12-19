import type { ERange } from "isaacscript-common-ts";
import type { MAX_PLAYERS } from "../constants";

/** The maximum number of players in a game is 6. Thus, the valid player indexes are 0 through 5. */
export type PlayerIndex = ERange<0, typeof MAX_PLAYERS>;
