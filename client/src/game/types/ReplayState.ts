import GameState from './GameState';

export default interface ReplayState {
  readonly active: boolean;
  readonly turn: number;
  readonly states: readonly GameState[];
  readonly ongoingHypothetical: GameState | null;
  readonly hypotheticalStates: readonly GameState[];
}
