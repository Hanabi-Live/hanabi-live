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
  if (!state.active && action.type !== 'replayEnter') {
    throw new Error(`A "${action.type}" action was dispatched, but we are not in a replay.`);
  }

  switch (action.type) {
    // --------------
    // Replay actions
    // --------------

    case 'replayEnter': {
      if (state.active) {
        throw new Error(`A "${action.type}" action was dispatched, but we are already in a replay.`);
      }
      state.active = true;

      if (typeof action.segment !== 'number') {
        throw new Error(`The "${action.type}" action segment was not a number.`);
      }
      if (action.segment < 0) {
        throw new Error(`The "${action.type}" action segment was less than 0.`);
      }
      state.segment = action.segment;

      break;
    }

    case 'replayExit': {
      state.active = false;
      state.segment = 0;

      break;
    }

    case 'replaySegment': {
      if (typeof action.segment !== 'number') {
        throw new Error(`The "${action.type}" action segment was not a number.`);
      }
      if (action.segment < 0) {
        throw new Error(`The "${action.type}" action segment was less than 0.`);
      }
      state.segment = action.segment;

      break;
    }

    case 'replaySharedSegment': {
      if (state.shared === null) {
        throw new Error(`A "${action.type}" action was dispatched, but we are not in a shared replay.`);
      }
      if (typeof action.segment !== 'number') {
        throw new Error(`The "${action.type}" action segment was not a number.`);
      }
      if (action.segment < 0) {
        throw new Error(`The "${action.type}" action segment was less than 0.`);
      }
      state.shared.segment = action.segment;

      if (state.shared.useSharedSegments) {
        state.segment = action.segment;
      }

      break;
    }

    case 'replayUseSharedSegments': {
      if (state.shared === null) {
        throw new Error(`A "${action.type}" action was dispatched, but we are not in a shared replay.`);
      }
      state.shared.useSharedSegments = action.useSharedSegments;

      // If we are the replay leader and we are re-enabling shared segments,
      // we also want to update the shared segment to our current segment
      if (state.shared.amLeader && state.shared.useSharedSegments) {
        state.shared.segment = state.segment;
      }

      break;
    }

    case 'replayLeader': {
      if (state.shared === null) {
        throw new Error(`A "${action.type}" action was dispatched, but we are not in a shared replay.`);
      }
      state.shared.leader = action.name;
      state.shared.amLeader = action.name === metadata.ourUsername;
      break;
    }

    // --------------------
    // Hypothetical actions
    // --------------------

    case 'hypoStart': {
      if (state.hypothetical !== null) {
        throw new Error(`A "${action.type}" action was dispatched with a non-null hypothetical state.`);
      }

      const ongoing = state.states[state.segment];
      state.hypothetical = {
        ongoing,
        states: [ongoing],
        drawnCardsShown: action.drawnCardsShown,
        drawnCardsInHypothetical: [],
        morphedIdentities: [],
      };

      break;
    }

    case 'hypoEnd': {
      if (state.hypothetical === null) {
        throw new Error(`A "${action.type}" action was dispatched with a null hypothetical state.`);
      }

      state.hypothetical = null;
      break;
    }

    case 'hypoBack': {
      if (state.hypothetical === null) {
        throw new Error(`A "${action.type}" action was dispatched with a null hypothetical state.`);
      }

      const hypoStates = state.hypothetical.states;
      hypoStates.pop();
      const lastState = hypoStates[hypoStates.length - 1];
      state.hypothetical.ongoing = lastState;
      break;
    }

    case 'hypoRevealed': {
      if (state.hypothetical === null) {
        throw new Error(`A "${action.type}" action was dispatched with a null hypothetical state.`);
      }

      state.hypothetical.drawnCardsShown = action.showDrawnCards;
      // Filter out all identities morphed to blank
      if (action.showDrawnCards) {
        const morphed = original(state.hypothetical.morphedIdentities)!;
        for (let i = 0; i < morphed.length; i++) {
          // Note: the for loop is necessary because the array is not contiguous
          // Array.filter would change the indexes
          state.hypothetical.morphedIdentities = [];
          if (
            morphed[i] !== undefined
            && morphed[i].rank !== null
            && morphed[i].suitIndex !== null
          ) {
            state.hypothetical.morphedIdentities[i] = morphed[i];
          }
        }
      } else {
        // Hide all cards drawn since the beginning of the hypothetical
        original(state.hypothetical.drawnCardsInHypothetical)!.forEach((order) => {
          state.hypothetical!.morphedIdentities[order] = {
            rank: null,
            suitIndex: null,
          };
        });
      }

      break;
    }

    case 'hypoAction': {
      if (state.hypothetical === null) {
        throw new Error(`A "${action.type}" action was dispatched with a null hypothetical state.`);
      }

      // Local variables
      const a = action.action;

      // The morph action is exclusively handled here
      // Also take note of any draws that conflict with the known card identities
      if (a.type === 'morph' || a.type === 'draw') {
        let suitIndex = nullIfNegative(a.suitIndex);
        let rank = nullIfNegative(a.rank);

        if (a.type === 'draw') {
          // Store drawn cards to be able to show/hide in the future
          state.hypothetical.drawnCardsInHypothetical.push(a.order);
          if (!state.hypothetical.drawnCardsShown) {
            // Mark this one as blank
            suitIndex = null;
            rank = null;
          }
        }

        if (
          // Stack bases can be morphed, but their orders are higher than the deck size
          a.order >= cardIdentities.length
          || suitIndex !== cardIdentities[a.order].suitIndex
          || rank !== cardIdentities[a.order].rank
        ) {
          // This card has been morphed or blanked
          state.hypothetical.morphedIdentities[a.order] = {
            suitIndex,
            rank,
          };
        }
      }

      // The game state doesn't care about morphed cards
      if (a.type === 'morph') {
        break;
      }

      const hypoState = original(state.hypothetical.ongoing);
      const newState = gameStateReducer(hypoState, a, true, metadata);
      state.hypothetical.ongoing = newState;

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
