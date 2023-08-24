import type { PlayerIndex } from "@hanabi/data";

export interface PauseState {
  readonly active: boolean;
  readonly playerIndex: PlayerIndex;
  readonly queued: boolean;
}
