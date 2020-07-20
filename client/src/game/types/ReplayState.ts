import { GameAction } from './actions';
import GameState from './GameState';
import HypotheticalState from './HypotheticalState';

export default interface ReplayState {
  readonly active: boolean;
  readonly segment: number;
  readonly states: readonly GameState[]; // Indexed by segment
  // Used to re-compute states at the end of an ongoing game
  readonly actions: readonly GameAction[];
  readonly sharedSegment: number;
  readonly useSharedSegments: boolean;
  readonly hypothetical: HypotheticalState | null;
}
