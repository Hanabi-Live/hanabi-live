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

      databaseID: null,
      shared: null,
      hypothetical: null,
    },

    playing: true,
    finished: false,

    metadata,
    cardIdentities: [],
    premove: null,
    pause: {
      active: false,
      playerIndex: 0,
      queued: false,
    },
    spectators: [],
  };
}
