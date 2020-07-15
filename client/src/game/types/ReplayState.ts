import { GameAction } from './actions';
import GameState from './GameState';
import HypotheticalState from './HypotheticalState';

export default interface ReplayState {
  readonly active: boolean;
  readonly segment: number;
  readonly states: readonly GameState[];
  readonly actions: readonly GameAction[];
  readonly hypothetical: HypotheticalState | null;
}
