import { GameAction } from './actions';
import GameState from './GameState';
import HypotheticalState from './HypotheticalState';

export default interface ReplayState {
  readonly active: boolean;
  readonly segment: number;
  readonly states: readonly GameState[]; // Indexed by segment

  // All of the individual game actions are stored alongside the computed states for each turn
  // This is used so that we can re-compute the game state for each turn at the end of an ongoing
  // game
  readonly actions: readonly GameAction[];

  readonly databaseID: number | null;
  readonly shared: boolean;
  readonly sharedSegment: number;
  readonly useSharedSegments: boolean;
  readonly hypothetical: HypotheticalState | null;
}
