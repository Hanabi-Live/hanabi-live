// The main reducer for the game mode, contemplating replays and game actions

// Imports
import produce, { Draft, original } from 'immer';
import { VARIANTS } from '../data/gameData';
import { Action, GameAction } from '../types/actions';
import GameState from '../types/GameState';
import State from '../types/State';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialGameState';

const stateReducer = produce((state: Draft<State>, action: Action) => {
  switch (action.type) {
    case 'gameActionList': {
      // Calculate all the intermediate states
      const initial = initialGameState(
        VARIANTS.get(state.game.variantName)!,
        state.game.hands.length,
      );
      const states: GameState[] = [initial];

      state.game = action.actions.reduce((s: GameState, a: GameAction) => {
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
    case 'startReplay': {
      state.replay.active = true;
      state.replay.turn = 0;
      break;
    }
    case 'endReplay': {
      state.replay.active = false;
      state.replay.turn = 0;
      break;
    }
    case 'goToTurn': {
      state.replay.turn = action.turn;
      break;
    }
    default: {
      // A new game state happened
      state.game = gameStateReducer(original(state.game)!, action)!;
      if (action.type === 'turn') {
        // Save it for replays
        state.replay.states[action.num] = state.game;
      }
      if (!state.replay.active) {
        // Update the visible state to the game state
        state.visibleState = state.game;
      }
      break;
    }
  }

  // Update the visible state to the game or replay state
  if (state.replay.active) {
    state.visibleState = state.replay.states[state.replay.turn];
  } else {
    state.visibleState = state.game;
  }
}, {} as State);

export default stateReducer;
