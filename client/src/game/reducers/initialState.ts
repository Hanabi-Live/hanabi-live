import State from '../types/State';
import Variant from '../types/Variant';
import initialGameState from './initialGameState';

export default function initialState(variant: Variant, playerCount: number): State {
  const game = initialGameState(variant, playerCount);
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
