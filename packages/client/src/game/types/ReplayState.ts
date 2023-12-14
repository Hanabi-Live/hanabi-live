import type { GameAction } from "./actions";
import type { GameState } from "./GameState";
import type { HypotheticalState } from "./HypotheticalState";
import type { SharedReplayState } from "./SharedReplayState";

export interface ReplayState {
  readonly active: boolean;
  readonly segment: number;
  readonly states: readonly GameState[]; // Indexed by segment.

  // All of the individual game actions are stored alongside the computed states for each turn. This
  // is used so that we can re-compute the game state for each turn at the end of an ongoing game.
  readonly actions: readonly GameAction[];

  readonly databaseID: number | null; // `null` if we are in an ongoing game.
  readonly shared: SharedReplayState | null;
  readonly hypothetical: HypotheticalState | null;
}
