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

    // It is now a new turn
    // {num: 0, type: "turn", who: 1}
    case 'turn': {
      // TEMP: At this point, check that the local state matches the server
      if (state.turn !== action.num) {
        console.warn('The turns from the client and the server do not match. '
            + `Client = ${state.turn}, Server = ${action.num}`);
      }
      if (state.currentPlayerIndex !== action.who && action.who !== -1) {
        // TODO the client should set the "currentPlayerIndex" index to -1 when the game is over
        // But it does not have logic to know when the game is over yet
        console.warn('The currentPlayerIndex from the client and the server do not match. '
            + `Client = ${state.currentPlayerIndex}, Server = ${action.who}`);
      }
      break;
    }

    default: {
      break;
    }
  }
}, {} as TurnState);

export default turnReducer;
