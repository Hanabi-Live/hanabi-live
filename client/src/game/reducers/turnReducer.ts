import produce, { Draft } from 'immer';
import { GameAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import TurnState from '../types/TurnState';

const turnReducer = produce((
  state: Draft<TurnState>,
  action: GameAction,
  metadata: GameMetadata,
  deckSize: number,
) => {
  const numPlayers = metadata.options.numPlayers;
  switch (action.type) {
    case 'play':
    case 'discard': {
      state.cardsPlayedOrDiscardedThisTurn += 1;

      if (deckSize === 0) {
        nextTurn(state, numPlayers);
      }

      break;
    }

    case 'clue': {
      nextTurn(state, numPlayers);
      break;
    }

    case 'draw': {
      // TODO: const character = metadata.characterAssignments[state.currentPlayerIndex];
      // TODO: if (turnRules.shouldEndTurn(state.cardsPlayedOrDiscardedThisTurn, character)) {
      if (state.cardsPlayedOrDiscardedThisTurn === 1) {
        nextTurn(state, numPlayers);
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

      // TEMP: the client should set the "currentPlayerIndex" index to -1 when the game is over
      // But it does not have logic to know when the game is over yet
      if (action.who === -1) {
        state.currentPlayerIndex = -1;
      }

      if (state.currentPlayerIndex !== action.who) {
        // TODO
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

function nextTurn(state: Draft<TurnState>, numPlayers: number) {
  state.turn += 1;
  state.currentPlayerIndex += 1;
  if (state.currentPlayerIndex === numPlayers) {
    state.currentPlayerIndex = 0;
  }
  state.cardsPlayedOrDiscardedThisTurn = 0;
}
