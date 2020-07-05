// The main reducer for the game mode, contemplating replays and game actions

import produce, {
  castDraft,
  Draft,
  original,
} from 'immer';
import { Action, GameAction } from '../types/actions';
import GameState from '../types/GameState';
import State from '../types/State';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';
import replayReducer from './replayReducer';

const stateReducer = produce((state: Draft<State>, action: Action) => {
  switch (action.type) {
    case 'gameActionList': {
      // Calculate all the intermediate states
      const initial = initialGameState(state.metadata);
      const states: GameState[] = [initial];

      const game = action.actions.reduce((s: GameState, a: GameAction) => {
        const nextState = gameStateReducer(s, a, state.metadata);

        if (a.type === 'turn') {
          // Store the current state in the state table to enable replays
          states[a.num] = nextState;
        }

        return nextState;
      }, initial);
      state.ongoingGame = castDraft(game);

      state.replay.states = castDraft(states);
      break;
    }
    case 'startReplay':
    case 'endReplay':
    case 'goToTurn':
    case 'hypoStart':
    case 'hypoBack':
    case 'hypoEnd':
    case 'hypoAction': {
      state.replay = replayReducer(state.replay, action, state.metadata);
      break;
    }
    default: {
      // A new game state happened
      state.ongoingGame = gameStateReducer(original(state.ongoingGame)!, action, state.metadata)!;
      if (action.type === 'turn') {
        // Save it for replays
        state.replay.states[action.num] = state.ongoingGame;
      }
      break;
    }
  }

  // Update the visible state to the game or replay state
  if (state.replay.active) {
    state.visibleState = state.replay.ongoingHypothetical ?? state.replay.states[state.replay.turn];
  } else {
    state.visibleState = state.ongoingGame;
  }

  // Make the currently visible state from the JavaScript console (for debugging purposes)
  window.state = state.visibleState;
}, {} as State);

export default stateReducer;

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    state: GameState;
  }
}
