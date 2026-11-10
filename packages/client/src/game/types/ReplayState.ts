import type {
  GameAction,
  GameState,
  HypotheticalState,
} from "@hanabi-live/game";
import type { SharedReplayState } from "./SharedReplayState";

export interface ReplayState {
  readonly active: boolean;
  readonly segment: number;
  readonly states: readonly GameState[]; // Indexed by segment.

  // All of the individual game actions are stored alongside the computed states for each turn. This
  // is used so that we can re-compute the game state for each turn at the end of an ongoing game.
  readonly actions: readonly GameAction[];

  /** Absent when the game is not in the database, such as an ongoing or imported game. */
  readonly gameID: number | undefined;
  readonly shared: SharedReplayState | undefined;

  /**
   * Our own hypothetical, which only we control. This is any hypothetical outside of a shared
   * replay. It can also be one that we were in when our game ended.
   */
  readonly ownHypothetical: HypotheticalState | undefined;

  /**
   * The hypothetical that we show: our own, or else the leader's while we use the shared segments.
   */
  readonly hypothetical: HypotheticalState | undefined;
}
