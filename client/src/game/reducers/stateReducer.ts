// The main reducer for the game mode, contemplating replays and game actions

// Imports
import produce, { Draft, original } from 'immer';
import { VARIANTS } from '../data/gameData';
import { Action, GameAction } from '../types/actions';
import GameState from '../types/GameState';
import State from '../types/State';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';
import replayReducer from './replayReducer';

const stateReducer = produce((state: Draft<State>, action: Action) => {
  switch (action.type) {
    case 'gameActionList': {
      // Calculate all the intermediate states
      const initial = initialGameState(
        VARIANTS.get(state.ongoingGame.variantName)!,
        state.ongoingGame.hands.length,
      );
      const states: GameState[] = [initial];

      state.ongoingGame = action.actions.reduce((s: GameState, a: GameAction) => {
        const nextState = gameStateReducer(s, a);

        if (a.type === 'turn') {
          // Store the current state in the state table to enable replays
          states[a.num] = nextState;
        }

        return nextState;
      }, initial);

      state.replay.states = states;
      break;
    }
    case 'startReplay':
    case 'endReplay':
    case 'goToTurn':
    case 'hypoStart':
    case 'hypoBack':
    case 'hypoEnd':
    case 'hypoAction': {
      state.replay = replayReducer(state.replay, action);
      break;
    }
    default: {
      // A new game state happened
      state.ongoingGame = gameStateReducer(original(state.ongoingGame)!, action)!;
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
}, {} as State);

export default stateReducer;
