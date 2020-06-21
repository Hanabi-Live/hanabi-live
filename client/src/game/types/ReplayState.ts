import GameState from './GameState';

export default interface ReplayState {
  readonly active: boolean,
  readonly turn: number,
  readonly states: GameState[],
  readonly ongoingHypothetical: GameState | null,
  readonly hypotheticalStates: GameState[],
}
