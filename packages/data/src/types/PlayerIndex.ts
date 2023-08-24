import type { Add, Range, Subtract } from "@hanabi/utils";
import type { MAX_PLAYERS, MIN_PLAYERS } from "../constants";

export type PlayerIndex = Range<
  0,
  Add<Subtract<typeof MAX_PLAYERS, typeof MIN_PLAYERS>, 1>
>;
