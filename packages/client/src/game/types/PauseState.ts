import type { PlayerIndex } from "@hanabi-live/game";

export interface PauseState {
  readonly active: boolean;
  readonly playerIndex: PlayerIndex;
  readonly queued: boolean;
}
