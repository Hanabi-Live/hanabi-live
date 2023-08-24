import type { ERange } from "@hanabi/utils";
import type { MAX_PLAYERS } from "../constants";

export type PlayerIndex = ERange<0, typeof MAX_PLAYERS>;
