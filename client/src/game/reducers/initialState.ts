import Options from '../types/Options';
import State from '../types/State';
import initialGameState from './initialGameState';

export default function initialState(options: Options): State {
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
