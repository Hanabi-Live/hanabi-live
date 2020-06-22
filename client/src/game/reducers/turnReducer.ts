import produce, { Draft } from 'immer';
import { GameAction } from '../types/actions';
import GameState from '../types/GameState';

const turnReducer = produce((state: Draft<GameState>, action: GameAction) => {
  switch (action.type) {
    case 'play': case 'clue': case 'discard': {
      state.turn += 1;
      state.currentPlayerIndex += 1;
      state.currentPlayerIndex %= state.hands.length;
      break;
    }
    default: {
      break;
    }
  }
}, {} as GameState);

export default turnReducer;
