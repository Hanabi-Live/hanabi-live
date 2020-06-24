import produce, { Draft } from 'immer';
import { GameAction } from '../types/actions';
import TurnState from '../types/TurnState';

const turnReducer = produce((state: Draft<TurnState>, action: GameAction, numPlayers: number) => {
  switch (action.type) {
    case 'play':
    case 'discard':
    case 'clue': {
      state.turn += 1;
      state.currentPlayerIndex += 1;
      if (state.currentPlayerIndex === numPlayers) {
        state.currentPlayerIndex = 0;
      }
      break;
    }
    default: {
      break;
    }
  }
}, {} as TurnState);

export default turnReducer;
