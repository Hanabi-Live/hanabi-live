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

      // We copy the card identities to the global state for convenience
      updateCardIdentities(state);

      state.replay.states = castDraft(states);
      break;
    }

    case 'cardIdentities': {
      // Either we just entered a new replay or an ongoing game ended,
      // so the server sent us a list of the identities for every card in the deck
      state.cardIdentities = action.cardIdentities;
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
      // A new game action happened
      state.ongoingGame = gameStateReducer(original(state.ongoingGame)!, action, state.metadata)!;

      // We copy the card identities to the global state for convenience
      updateCardIdentities(state);

      // Save a copy of the game state on every turn (for the purposes of in-game replays)
      if (action.type === 'turn') {
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

// We keep a copy of each card identity in the global state for convenience
// After each game action, check to see if we can add any new card identities
// (or any suit/rank information to existing card identities)
// We cannot just replace the array every time because we need to keep the "full" deck that the
// server sends us
const updateCardIdentities = (state: Draft<State>) => {
  state.ongoingGame.deck.forEach((newCardIdentity, i) => {
    if (i >= state.cardIdentities.length) {
      // Add the new card identity
      state.cardIdentities[i] = {
        suitIndex: newCardIdentity.suitIndex,
        rank: newCardIdentity.rank,
      };
    } else {
      // Update the existing card identity
      const existingCardIdentity = state.cardIdentities[i];
      if (existingCardIdentity.suitIndex === null) {
        existingCardIdentity.suitIndex = newCardIdentity.suitIndex;
      }
      if (existingCardIdentity.rank === null) {
        existingCardIdentity.rank = newCardIdentity.rank;
      }
    }
  });
};
