// The main reducer for the game mode, contemplating replays and game actions.

import { assertDefined, assertNotNull } from "@hanabi/utils";
import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import * as segmentRules from "../rules/segment";
import type { CardIdentity } from "../types/CardIdentity";
import type { GameMetadata } from "../types/GameMetadata";
import type { GameState } from "../types/GameState";
import type { State } from "../types/State";
import type { Action, GameAction } from "../types/actions";
import { gameStateReducer } from "./gameStateReducer";
import { initialGameState } from "./initialStates/initialGameState";
import { notesReducer } from "./notesReducer";
import { replayReducer } from "./replayReducer";
import { uiReducer } from "./uiReducer";

export const stateReducer = produce(stateReducerFunction, {} as State);

function stateReducerFunction(state: Draft<State>, action: Action) {
  switch (action.type) {
    case "gameActionList": {
      // Calculate all the intermediate states.
      const initialState = initialGameState(state.metadata);

      const { game, states } = reduceGameActions(
        action.actions,
        initialState,
        state.playing,
        state.shadowing,
        state.finished,
        state.metadata,
      );

      state.ongoingGame = castDraft(game);

      // Initialized, ready to show.
      state.visibleState = state.ongoingGame;

      // We copy the card identities to the global state for convenience.
      updateCardIdentities(state);

      state.replay.states = castDraft(states);
      state.replay.actions = castDraft(action.actions);
      break;
    }

    case "cardIdentities": {
      // Either we just entered a new replay or an ongoing game ended, so the server sent us a list
      // of the identities for every card in the deck.
      state.cardIdentities = castDraft(action.cardIdentities);

      // If we were in a variant that scrubbed plays and discards, rehydrate them now.
      state.replay.actions = castDraft(
        rehydrateScrubbedActions(state, action.cardIdentities),
      );

      break;
    }

    case "finishOngoingGame": {
      if (state.playing || state.shadowing) {
        // We were playing in a game that just ended. Recalculate the whole game as a spectator to
        // fix card possibilities.
        state.playing = false;
        state.shadowing = false;

        const initialState = initialGameState(state.metadata);
        const { game, states } = reduceGameActions(
          state.replay.actions,
          initialState,
          state.playing,
          state.shadowing,
          true,
          state.metadata,
        );

        state.ongoingGame = castDraft(game);
        state.visibleState = state.ongoingGame;
        state.replay.states = castDraft(states);
      }

      // Mark that this game is now finished. The finished view will take care of enabling the UI
      // elements for a shared replay.
      state.finished = true;
      state.datetimeFinished = action.datetimeFinished;

      // Record the database ID of the game.
      state.replay.databaseID = action.databaseID;

      // If we were in an in-game replay when the game ended, keep us at the current turn so that we
      // are not taken away from what we are looking at. Otherwise, go to the penultimate segment.
      // We want to use the penultimate segment instead of the final segment, because the final
      // segment will contain the times for all of the players, and this will drown out the reason
      // that the game ended.
      const inInGameReplay = state.replay.active;

      assertNotNull(
        state.ongoingGame.turn.segment,
        "The segment for the ongoing game was null when it finished.",
      );

      if (state.ongoingGame.turn.segment < 1) {
        throw new Error(
          "The segment for the ongoing game was less than 1 when it finished.",
        );
      }

      const penultimateSegment = state.ongoingGame.turn.segment - 1;

      if (!inInGameReplay) {
        state.replay.active = true;
        state.replay.segment = penultimateSegment;
      }

      // Initialize the shared replay.
      state.replay.shared = {
        segment: penultimateSegment,
        useSharedSegments: !inInGameReplay,
        leader: action.sharedReplayLeader,
        amLeader: action.sharedReplayLeader === state.metadata.ourUsername,
      };

      break;
    }

    case "init": {
      state.datetimeStarted = action.datetimeStarted;
      state.datetimeFinished = action.datetimeFinished;

      if (action.spectating) {
        state.playing = false;
      }
      if (action.shadowing) {
        state.shadowing = true;
      }

      if (action.replay) {
        state.playing = false;
        state.shadowing = false;
        state.finished = true;
        state.replay.active = true;
        state.replay.segment = 0; // In dedicated solo replays, start on the first segment
        state.replay.databaseID = action.databaseID;

        if (action.sharedReplay) {
          // In dedicated shared replays, start on the shared replay turn.
          state.replay.segment = action.sharedReplaySegment;
          state.replay.shared = {
            segment: action.sharedReplaySegment,
            useSharedSegments: true,
            leader: action.sharedReplayLeader,
            amLeader: action.sharedReplayLeader === state.metadata.ourUsername,
          };
        }
      }

      if (action.paused) {
        state.pause.active = true;
        state.pause.playerIndex = action.pausePlayerIndex;
      }

      break;
    }

    case "replayEnter":
    case "replayExit":
    case "replaySegment":
    case "replaySharedSegment":
    case "replayUseSharedSegments":
    case "replayLeader":
    case "hypoStart":
    case "hypoBack":
    case "hypoEnd":
    case "hypoAction":
    case "hypoShowDrawnCards": {
      state.replay = castDraft(
        replayReducer(state.replay, action, state.finished, state.metadata),
      );
      break;
    }

    case "dragStart": {
      state.UI = uiReducer(state.UI, action);
      break;
    }

    case "dragReset": {
      state.UI = uiReducer(state.UI, action);
      break;
    }

    case "premove": {
      if (action.premove === null) {
        // Allow the clearing of a premove anytime. (It might be our turn and we are clearing the
        // premove prior to sending our action to the server.)
        state.premove = null;
      } else if (
        // Only allow premoves in ongoing games.
        !state.finished &&
        // Only allow premoves when it is not our turn.
        state.ongoingGame.turn.currentPlayerIndex !==
          state.metadata.ourPlayerIndex
      ) {
        state.premove = action.premove;
      }

      break;
    }

    case "pause": {
      state.pause.active = action.active;
      state.pause.playerIndex = action.playerIndex;

      // If the game is now paused, unqueue any queued pauses.
      if (action.active) {
        state.pause.queued = false;
      }

      break;
    }

    case "pauseQueue": {
      state.pause.queued = action.queued;
      break;
    }

    case "spectators": {
      state.spectators = castDraft(action.spectators);
      break;
    }

    case "noteList":
    case "receiveNote": {
      state.notes = castDraft(
        notesReducer(
          original(state.notes),
          action,
          state.metadata,
          state.playing,
          state.finished,
        ),
      );
      break;
    }

    case "setEffMod":
    case "editNote":
    case "noteListPlayer": {
      state.notes = castDraft(
        notesReducer(
          original(state.notes),
          action,
          state.metadata,
          state.playing,
          state.finished,
        ),
      );

      if (state.playing && !state.finished) {
        // Recompute efficiency since it could change.
        state.ongoingGame = castDraft(
          gameStateReducer(
            original(state.ongoingGame),
            action,
            state.playing,
            state.shadowing,
            state.finished,
            state.replay.hypothetical !== null,
            state.metadata,
            state.notes.ourNotes,
          ),
        );
      }
      break;
    }

    default: {
      // A new game action happened.
      const previousSegment = state.ongoingGame.turn.segment;
      state.ongoingGame = castDraft(
        gameStateReducer(
          original(state.ongoingGame),
          action,
          state.playing,
          state.shadowing,
          state.finished,
          false,
          state.metadata,
          state.notes.ourNotes,
        ),
      );

      // We copy the card identities to the global state for convenience.
      updateCardIdentities(state);

      if (
        segmentRules.shouldStore(
          state.ongoingGame.turn.segment,
          previousSegment,
          action,
        ) &&
        state.ongoingGame.turn.segment !== null
      ) {
        state.replay.states[state.ongoingGame.turn.segment] = state.ongoingGame;
      }

      // Save the action so that we can recompute the state at the end of the game.
      state.replay.actions.push(castDraft(action));

      break;
    }
  }

  // Show the appropriate state depending on the situation.
  state.visibleState = visualStateToShow(state, action);
}

// Runs through a list of actions from an initial state, and returns the final state and all
// intermediate states.
function reduceGameActions(
  actions: readonly GameAction[],
  initialState: GameState,
  playing: boolean,
  shadowing: boolean,
  finished: boolean,
  metadata: GameMetadata,
) {
  const states: GameState[] = [initialState];

  // eslint-disable-next-line unicorn/no-array-reduce
  const game = actions.reduce((s: GameState, a: GameAction) => {
    const nextState = gameStateReducer(
      s,
      a,
      playing,
      shadowing,
      finished,
      false,
      metadata,
    );

    if (
      segmentRules.shouldStore(nextState.turn.segment, s.turn.segment, a) &&
      nextState.turn.segment !== null
    ) {
      states[nextState.turn.segment] = nextState;
    }

    return nextState;
  }, initialState);

  return { game, states };
}

// We keep a copy of each card identity in the global state for convenience After each game action,
// check to see if we can add any new card identities (or any suit/rank information to existing card
// identities). We cannot just replace the array every time because we need to keep the "full" deck
// that the server sends us.
function updateCardIdentities(state: Draft<State>) {
  for (const [i, newCardIdentity] of state.ongoingGame.deck.entries()) {
    if (i >= state.cardIdentities.length) {
      // Add the new card identity.
      state.cardIdentities[i] = {
        suitIndex: newCardIdentity.suitIndex,
        rank: newCardIdentity.rank,
      };
    } else {
      // Update the existing card identity.
      const existingCardIdentity = state.cardIdentities[i];
      assertDefined(
        existingCardIdentity,
        `Failed to find the existing card identity at index: ${i}`,
      );

      if (existingCardIdentity.suitIndex === null) {
        existingCardIdentity.suitIndex = newCardIdentity.suitIndex;
      }
      if (existingCardIdentity.rank === null) {
        existingCardIdentity.rank = newCardIdentity.rank;
      }
    }
  }
}

function visualStateToShow(
  state: Draft<State>,
  action: Action,
): Draft<GameState> | null {
  if (state.visibleState === null) {
    // The state is still initializing, so do not show anything.
    return null;
  }

  if (state.replay.active) {
    if (state.replay.hypothetical === null) {
      // Show the current replay segment.
      const currentReplayState = state.replay.states[state.replay.segment];
      assertDefined(
        currentReplayState,
        `Failed to find the replay state for segment: ${state.replay.segment}`,
      );

      return currentReplayState;
    }

    // Show the current hypothetical.
    return state.replay.hypothetical.ongoing;
  }

  // After an ongoing game ends, do not automatically show the final segment with the player's times
  // by default in order to avoid drowning out the reason why the game ended.
  if (action.type === "playerTimes") {
    return state.replay.states.at(-2) ?? null; // The penultimate segment
  }

  // Show the final segment of the current game.
  return state.ongoingGame;
}

function rehydrateScrubbedActions(
  state: State,
  cardIdentities: readonly CardIdentity[],
): readonly GameAction[] {
  return state.replay.actions.map((action) => {
    if (
      (action.type === "play" ||
        action.type === "discard" ||
        action.type === "draw") &&
      (action.suitIndex === -1 || action.rank === -1)
    ) {
      const cardIdentity = cardIdentities[action.order];
      assertDefined(
        cardIdentity,
        "Failed to find the card identity for an action while rehydrating the scrubbed actions.",
      );

      const { suitIndex, rank } = cardIdentity;
      if (suitIndex === null || rank === null) {
        throw new Error(
          "Failed to find the suit index or rank of a card identity for an action while rehydrating the scrubbed actions.",
        );
      }

      return {
        ...action,
        suitIndex,
        rank,
      };
    }

    return action;
  });
}
