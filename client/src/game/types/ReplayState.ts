import GameState from './GameState';
import HypotheticalState from './HypotheticalState';

export default interface ReplayState {
  readonly active: boolean;
  readonly turn: number;
  readonly states: readonly GameState[];
  readonly hypothetical: HypotheticalState | null;
}
