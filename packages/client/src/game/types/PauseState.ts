import type { PlayerIndex } from "@hanabi-live/game";

export interface PauseState {
  /** The seat that paused the game. Undefined when the game is not paused. */
  readonly pausingPlayerIndex: PlayerIndex | undefined;
  readonly queued: boolean;
}
