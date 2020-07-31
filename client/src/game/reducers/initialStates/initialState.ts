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
      sharedSegment: 0,
      useSharedSegments: false,
      hypothetical: null,
    },
    cardIdentities: [],
    metadata,
    premove: null,
    pause: {
      active: false,
      playerIndex: 0,
      queued: false,
    },
  };
}
