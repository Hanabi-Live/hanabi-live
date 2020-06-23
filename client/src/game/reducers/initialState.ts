import { StateOptions } from '../types/GameState';
import State from '../types/State';
import initialGameState from './initialGameState';

export default function initialState(options: StateOptions): State {
  const game = initialGameState(options);
  return {
    visibleState: game,
    ongoingGame: game,
    replay: {
      active: false,
      turn: 0,
      states: [],
      ongoingHypothetical: null,
      hypotheticalStates: [],
    },
  };
}
