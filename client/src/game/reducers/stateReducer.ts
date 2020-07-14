// The main reducer for the game mode, contemplating replays and game actions

import produce, {
  castDraft,
  Draft,
  original,
} from 'immer';
import { Action, GameAction } from '../types/actions';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import State from '../types/State';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';
import replayReducer from './replayReducer';

const stateReducer = produce((state: Draft<State>, action: Action) => {
  switch (action.type) {
    case 'gameActionList': {
      // Calculate all the intermediate states
      const initialState = initialGameState(state.metadata);

      const {
        game,
        states,
      } = reduceGameActions(action.actions, initialState, state.metadata);

      state.ongoingGame = castDraft(game);

      // Initialized, ready to show
      state.visibleState = state.ongoingGame;

      // We copy the card identities to the global state for convenience
      updateCardIdentities(state);

      state.replay.states = castDraft(states);
      state.replay.actions = action.actions;
      break;
    }

    case 'cardIdentities': {
      // Either we just entered a new replay or an ongoing game ended,
      // so the server sent us a list of the identities for every card in the deck
      state.cardIdentities = action.cardIdentities;

      // If the game just ended, recalculate the whole game as spectator to fix possibilities
      if (!state.metadata.spectating) {
        state.metadata.spectating = true;

        const initialState = initialGameState(state.metadata);
        const {
          game,
          states,
        } = reduceGameActions(state.replay.actions, initialState, state.metadata);

        // Update the visible game and replay states
        state.ongoingGame = castDraft(game);
        state.visibleState = state.ongoingGame;
        state.replay.states = castDraft(states);
      }

      break;
    }

    case 'startReplay':
    case 'endReplay':
    case 'goToTurn':
    case 'hypoStart':
    case 'hypoBack':
    case 'hypoEnd':
    case 'hypoAction':
    case 'hypoRevealed': {
      state.replay = replayReducer(
        state.replay,
        action,
        original(state.cardIdentities)!,
        state.metadata,
      );
      break;
    }

    case 'premove': {
      state.premove = action.premove;
      break;
    }

    default: {
      // A new game action happened
      const oldGameSegment = state.ongoingGame.turn.gameSegment;
      state.ongoingGame = gameStateReducer(original(state.ongoingGame)!, action, state.metadata)!;

      // We copy the card identities to the global state for convenience
      updateCardIdentities(state);

      // When the game state reducer sets "gameSegment" to a new number,
      // it is a signal to record the current state of the game (for the purposes of replays)
      if (
        state.ongoingGame.turn.gameSegment !== oldGameSegment
        && state.ongoingGame.turn.gameSegment !== null
      ) {
        state.replay.states[state.ongoingGame.turn.gameSegment] = state.ongoingGame;
      }

      break;
    }
  }

  // Update the visible state to the game or replay state
  // after it has been initialized
  if (state.visibleState !== null) {
    if (state.replay.active) {
      if (state.replay.hypothetical === null) {
        // Go to current replay turn
        state.visibleState = state.replay.states[state.replay.turn];
      } else {
        // Show the current hypothetical
        state.visibleState = state.replay.hypothetical.ongoing;
      }
    } else {
      // Default: the current game
      state.visibleState = state.ongoingGame;
    }
  }
}, {} as State);

export default stateReducer;

// Runs through a list of actions from an initial state, and returns the final state
// and all intermediate states
function reduceGameActions(actions: GameAction[], initialState: GameState, metadata: GameMetadata) {
  const states: GameState[] = [initialState];
  const game = actions.reduce((s: GameState, a: GameAction) => {
    const nextState = gameStateReducer(s, a, metadata);

    // When the game state reducer sets "gameSegment" to a new number,
    // it is a signal to record the current state of the game (for the purposes of replays)
    if (
      nextState.turn.gameSegment !== s.turn.gameSegment
        && nextState.turn.gameSegment !== null
    ) {
      states[nextState.turn.gameSegment] = nextState;
    }

    return nextState;
  }, initialState);
  return { game, states };
}

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
