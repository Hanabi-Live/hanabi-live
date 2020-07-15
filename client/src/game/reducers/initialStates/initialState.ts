import GameMetadata from '../../types/GameMetadata';
import State from '../../types/State';
import initialGameState from './initialGameState';

export default function initialState(metadata: GameMetadata): State {
  const game = initialGameState(metadata);
  return {
    visibleState: null,
    ongoingGame: game,
    replay: {
      active: false,
      segment: 0,
      states: [],
      actions: [],
      hypothetical: null,
    },
    cardIdentities: [],
    metadata,
    premove: null,
  };
}
