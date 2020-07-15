import GameMetadata from '../../types/GameMetadata';
import GameState from '../../types/GameState';
import initialGameState from './initialGameState';
import initialTurnState from './initialTurnState';

export default function initialGameStateTest(metadata: GameMetadata): GameState {
  return {
    ...initialGameState(metadata),
    turn: {
      ...initialTurnState(),
      segment: 0,
    },
  };
}
