// The reducer for replays and hypotheticals

import produce, { Draft, original } from 'immer';
import { ensureAllCases, nullIfNegative } from '../../misc';
import { ReplayAction } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import GameMetadata from '../types/GameMetadata';
import ReplayState from '../types/ReplayState';
import gameStateReducer from './gameStateReducer';

const replayReducer = produce((
  state: Draft<ReplayState>,
  action: ReplayAction,
  cardIdentities: readonly CardIdentity[],
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
      const ongoing = state.states[state.turn];
      state.hypothetical = {
        ongoing,
        states: [ongoing],
        drawnCardsShown: false,
        drawnCardsInHypothetical: [],
        morphedIdentities: [],
      };
      break;
    }
    case 'hypoEnd': {
      state.hypothetical = null;
      break;
    }
    case 'hypoBack': {
      const hypoStates = state.hypothetical!.states;
      hypoStates.pop();
      const lastState = hypoStates[hypoStates.length - 1];
      state.hypothetical!.ongoing = lastState;
      break;
    }
    case 'hypoRevealed': {
      state.hypothetical!.drawnCardsShown = action.showDrawnCards;
      // Filter out all identities morphed to blank
      if (action.showDrawnCards) {
        const morphed = original(state.hypothetical!.morphedIdentities)!;
        for (let i = 0; i < morphed.length; i++) {
          // Note: the for loop is necessary because the array is not contiguous
          // Array.filter would change the indexes
          state.hypothetical!.morphedIdentities = [];
          if (morphed[i] && morphed[i].rank !== null && morphed[i].suitIndex !== null) {
            state.hypothetical!.morphedIdentities[i] = morphed[i];
          }
        }
      } else {
        // Hide all cards drawn since the beginning of the hypothetical
        original(state.hypothetical!.drawnCardsInHypothetical)!.forEach((order) => {
          state.hypothetical!.morphedIdentities[order] = {
            rank: null,
            suitIndex: null,
          };
        });
      }
      break;
    }
    case 'hypoAction': {
      const a = action.action;
      // The morph action is handled here, exclusively
      // Also take note of any draws that conflict with the known card identities
      if (a.type === 'morph' || a.type === 'draw') {
        let suitIndex = nullIfNegative(a.suitIndex);
        let rank = nullIfNegative(a.rank);

        if (a.type === 'draw') {
          // Store drawn cards to be able to show/hide in the future
          state.hypothetical!.drawnCardsInHypothetical.push(a.order);
          if (!state.hypothetical!.drawnCardsShown) {
            // Mark this one as blank
            suitIndex = null;
            rank = null;
          }
        }

        if (
          suitIndex !== cardIdentities[a.order].suitIndex
          || rank !== cardIdentities[a.order].rank
        ) {
          // This card has been morphed or blanked
          state.hypothetical!.morphedIdentities[a.order] = {
            suitIndex,
            rank,
          };
        }
      }

      // The game state doesn't care about morphed cards
      if (a.type === 'morph') {
        break;
      }

      const hypoState = original(state.hypothetical?.ongoing)!;
      const newState = gameStateReducer(hypoState, a, metadata);
      state.hypothetical!.ongoing = newState;

      if (a.type === 'turn') {
        // Save it for going back
        state.hypothetical!.states.push(newState);
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
