import State from '../types/State';
import Variant from '../types/Variant';
import initialGameState from './initialGameState';

export default function initialState(
  variant: Variant,
  playerCount: number,
  startingPlayer: number = 0,
): State {
  const game = initialGameState(variant, playerCount, startingPlayer);
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
