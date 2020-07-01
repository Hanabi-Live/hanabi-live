import GameMetadata from '../../types/GameMetadata';
import State from '../../types/State';
import initialGameState from './initialGameState';

export default function initialState(metadata: GameMetadata): State {
  const game = initialGameState(metadata);
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
    metadata,
  };
}
