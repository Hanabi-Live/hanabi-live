// The main reducer for the game mode, contemplating replays and game actions

import produce, {
  castDraft,
  Draft,
  original,
  setAutoFreeze,
} from 'immer';
import { getVariant } from '../data/gameData';
import { variantRules } from '../rules';
import { Action, GameAction } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import EndCondition from '../types/EndCondition';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import State from '../types/State';
import gameStateReducer from './gameStateReducer';
import initialGameState from './initialStates/initialGameState';
import replayReducer from './replayReducer';

// Ensure that immer will always auto-freeze recursive structures (like replay states)
// This is necessary to prevent massive lag when WebPack bundles in production made
// This only has to be called once
setAutoFreeze(true);

const stateReducer = produce((state: Draft<State>, action: Action) => {
  switch (action.type) {
    case 'gameActionList': {
      // Calculate all the intermediate states
      const initialState = initialGameState(state.metadata);

      const {
        game,
        states,
      } = reduceGameActions(action.actions, initialState, state.playing, state.metadata);

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

      // If we were in a variant that scrubbed plays and discards, rehydrate them now
      state.replay.actions = castDraft(rehydrateScrubbedActions(state, action.cardIdentities));

      break;
    }

    case 'finishOngoingGame': {
      // If we were playing in a game that just ended,
      // recalculate the whole game as a spectator to fix card possibilities
      if (state.playing) {
        state.playing = false;

        const initialState = initialGameState(state.metadata);
        const {
          game,
          states,
        } = reduceGameActions(state.replay.actions, initialState, state.playing, state.metadata);

        state.ongoingGame = castDraft(game);
        state.visibleState = state.ongoingGame;
        state.replay.states = castDraft(states);
      }

      // Mark that this game is now finished
      // The finished view will take care of enabling the UI elements for a shared replay
      state.finished = true;

      // Record the database ID of the game
      state.replay.databaseID = action.databaseID;

      // If we were in an in-game replay when the game ended,
      // keep us at the current turn so that we are not taken away from what we are looking at
      // Otherwise, go to the penultimate segment
      // We want to use the penultimate segment instead of the final segment,
      // because the final segment will contain the times for all of the players,
      // and this will drown out the reason that the game ended
      const inInGameReplay = state.replay.active;
      if (state.ongoingGame.turn.segment === null) {
        throw new Error('The segment for the ongoing game was null when it finished.');
      }
      if (state.ongoingGame.turn.segment < 1) {
        throw new Error('The segment for the ongoing game was less than 1 when it finished.');
      }
      const penultimateSegment = state.ongoingGame.turn.segment - 1;
      if (!inInGameReplay) {
        state.replay.active = true;
        state.replay.segment = penultimateSegment;
      }

      // Initialize the shared replay
      state.replay.shared = {
        segment: penultimateSegment,
        useSharedSegments: !inInGameReplay,
        leader: action.sharedReplayLeader,
        amLeader: action.sharedReplayLeader === state.metadata.ourUsername,
      };

      break;
    }

    case 'replayEnterDedicated': {
      state.playing = false;
      state.finished = true;
      state.replay.active = true;
      state.replay.segment = 0;
      state.replay.databaseID = action.databaseID;

      if (action.shared) {
        state.replay.shared = {
          segment: action.sharedReplaySegment,
          useSharedSegments: true,
          leader: action.sharedReplayLeader,
          amLeader: action.sharedReplayLeader === state.metadata.ourUsername,
        };
      }

      break;
    }

    case 'replayEnter':
    case 'replayExit':
    case 'replaySegment':
    case 'replaySharedSegment':
    case 'replayUseSharedSegments':
    case 'replayLeader':
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

    case 'pause': {
      state.pause.active = action.active;
      state.pause.playerIndex = action.playerIndex;

      // If the game is now paused, unqueue any queued pauses
      if (action.active) {
        state.pause.queued = false;
      }

      break;
    }

    case 'pauseQueue': {
      state.pause.queued = action.queued;
      break;
    }

    case 'spectating': {
      state.playing = false;
      break;
    }

    case 'spectators': {
      state.spectators = action.spectators;
      break;
    }

    default: {
      // A new game action happened
      const previousSegment = state.ongoingGame.turn.segment;
      state.ongoingGame = gameStateReducer(
        original(state.ongoingGame),
        action,
        state.playing,
        state.metadata,
      );

      // We copy the card identities to the global state for convenience
      updateCardIdentities(state);

      if (shouldStoreSegment(state.ongoingGame.turn.segment, previousSegment, action)) {
        state.replay.states[state.ongoingGame.turn.segment!] = state.ongoingGame;
      }

      // Save the action so that we can recompute the state at the end of the game
      state.replay.actions.push(action);

      break;
    }
  }

  // Show the appropriate state depending on the situation
  state.visibleState = visualStateToShow(state);
}, {} as State);

export default stateReducer;

// Runs through a list of actions from an initial state,
// and returns the final state and all intermediate states
const reduceGameActions = (
  actions: GameAction[],
  initialState: GameState,
  playing: boolean,
  metadata: GameMetadata,
) => {
  const states: GameState[] = [initialState];
  const game = actions.reduce((s: GameState, a: GameAction) => {
    const nextState = gameStateReducer(s, a, playing, metadata);

    if (shouldStoreSegment(nextState.turn.segment, s.turn.segment, a)) {
      states[nextState.turn.segment!] = nextState;
    }

    return nextState;
  }, initialState);
  return { game, states };
};

// When the game state reducer sets "segment" to a new number,
// it is a signal to record the current state of the game (for the purposes of replays)
const shouldStoreSegment = (
  segment: number | null,
  previousSegment: number | null,
  action: GameAction,
) => {
  if (segment === null) {
    // The game is still doing the initial deal
    return false;
  }

  // The types of "gameOver" that have to do with the previous action should meld together with the
  // segment of the previous action
  // Any new end conditions must also be updated in the "gameOver" block in "turnReducer.ts"
  if (
    action.type === 'gameOver'
    && action.endCondition !== EndCondition.Timeout
    && action.endCondition !== EndCondition.Terminated
    && action.endCondition !== EndCondition.IdleTimeout
  ) {
    return true;
  }

  // By default, store a new segment whenever the turn reducer changes the segment number
  return segment !== previousSegment;
};

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

const visualStateToShow = (state: Draft<State>) => {
  if (state.visibleState === null) {
    // The state is still initializing, so do not show anything
    return null;
  }

  if (state.replay.active) {
    if (state.replay.hypothetical === null) {
      // Show the current replay segment
      const currentReplayState = state.replay.states[state.replay.segment];
      if (currentReplayState === undefined) {
        throw new Error(`Failed to find the replay state for segment ${state.replay.segment}.`);
      }
      return currentReplayState;
    }

    // Show the current hypothetical
    if (state.replay.hypothetical.ongoing === undefined) {
      throw new Error('The ongoing hypothetical state is undefined.');
    }
    return state.replay.hypothetical.ongoing;
  }

  // Show the final segment of the current game
  if (state.ongoingGame === undefined) {
    throw new Error('The ongoing state is undefined.');
  }
  return state.ongoingGame;
};

const rehydrateScrubbedActions = (state: State, cardIdentities: readonly CardIdentity[]) => {
  const variant = getVariant(state.metadata.options.variantName);
  if (!variantRules.isThrowItInAHole(variant)) {
    return state.replay.actions;
  }

  return state.replay.actions.map((a) => {
    if (
      (a.type === 'play' || a.type === 'discard')
      && (a.suitIndex === -1 || a.rank === -1)
    ) {
      return ({
        ...a,
        suitIndex: cardIdentities[a.order].suitIndex!,
        rank: cardIdentities[a.order].rank!,
      });
    }
    return a;
  });
};
