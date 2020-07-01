// The reducer for replays and hypotheticals

import produce, { Draft, original } from 'immer';
import { ensureAllCases } from '../../misc';
import { ReplayAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import ReplayState from '../types/ReplayState';
import gameStateReducer from './gameStateReducer';

const replayReducer = produce((
  state: Draft<ReplayState>,
  action: ReplayAction,
  metadata: GameMetadata,
) => {
  // Validate current state
  if (state.active && action.type === 'startReplay') {
    throw new Error('Tried to start a replay but replay was already active.');
  } else if (!state.active && action.type !== 'startReplay') {
    throw new Error('Tried perform a replay action but replay was not active.');
  }

  switch (action.type) {
    case 'startReplay': {
      state.active = true;
      state.turn = action.turn;
      break;
    }
    case 'endReplay': {
      state.active = false;
      state.turn = 0;
      break;
    }
    case 'goToTurn': {
      state.turn = action.turn;
      break;
    }
    case 'hypoStart': {
      state.ongoingHypothetical = state.states[state.turn];
      state.hypotheticalStates = [state.ongoingHypothetical];
      break;
    }
    case 'hypoEnd': {
      state.ongoingHypothetical = null;
      state.hypotheticalStates = [];
      break;
    }
    case 'hypoBack': {
      state.hypotheticalStates.pop();
      const lastState = state.hypotheticalStates[state.hypotheticalStates.length - 1];
      state.ongoingHypothetical = lastState;
      break;
    }
    case 'hypoAction': {
      // TODO: the game reducer doesn't care about the reveal action, yet
      if (action.action.type === 'reveal') {
        break;
      }

      const hypoState = original(state.ongoingHypothetical)!;
      state.ongoingHypothetical = gameStateReducer(hypoState, action.action, metadata);

      if (action.action.type === 'turn') {
        // Save it for going back
        state.hypotheticalStates.push(state.ongoingHypothetical);
      }

      break;
    }
    default: {
      ensureAllCases(action);
      break;
    }
  }
}, {} as ReplayState);

export default replayReducer;
