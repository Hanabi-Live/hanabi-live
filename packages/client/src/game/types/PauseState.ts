import type { PlayerIndex } from "@hanabi/game";

export interface PauseState {
  readonly active: boolean;
  readonly playerIndex: PlayerIndex;
  readonly queued: boolean;
}
