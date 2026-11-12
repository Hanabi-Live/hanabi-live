// The main reducer for the game mode, contemplating replays and game actions.

import type {
  CardIdentity,
  GameAction,
  GameMetadata,
  GameState,
} from "@hanabi-live/game";
import { gameReducer, getInitialGameState } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import type { State } from "../types/State.ts";
import type { Action } from "../types/actions.ts";
import { notesReducer } from "./notesReducer.ts";
import { replayReducer } from "./replayReducer.ts";
import { shouldStoreSegment } from "./stateReducerHelpers.ts";
import { uiReducer } from "./uiReducer.ts";

export const stateReducer = produce(stateReducerFunction, {} as State);

function stateReducerFunction(state: Draft<State>, action: Action) {
  switch (action.type) {
    case "gameActionList": {
      // Calculate all the intermediate states.
      const initialGameState = getInitialGameState(state.metadata);

      const { game, states } = reduceGameActions(
        action.actions,
        initialGameState,
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

    case "gameFinished": {
      if (state.playing || state.shadowing) {
        // We were playing in a game that just ended. Recalculate the whole game as a spectator to
        // fix card possibilities.
        state.playing = false;
        state.shadowing = false;

        const initialGameState = getInitialGameState(state.metadata);
        const { game, states } = reduceGameActions(
          state.replay.actions,
          initialGameState,
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

      // Record the database ID of the game, if it was saved.
      state.replay.gameId = action.gameId;

      // If we were in an in-game replay when the game ended, keep us at the current turn so that we
      // are not taken away from what we are looking at. Otherwise, go to the penultimate segment.
      // We want to use the penultimate segment instead of the final segment, because the final
      // segment will contain the times for all of the players, and this will drown out the reason
      // that the game ended.
      const inInGameReplay = state.replay.segment !== undefined;

      assertDefined(
        state.ongoingGame.turn.segment,
        "The segment for the ongoing game was undefined when it finished.",
      );

      if (state.ongoingGame.turn.segment < 1) {
        throw new Error(
          "The segment for the ongoing game was less than 1 when it finished.",
        );
      }

      const penultimateSegment = state.ongoingGame.turn.segment - 1;

      if (!inInGameReplay) {
        state.replay.segment = penultimateSegment;
      }

      // Initialize the shared replay. Its players stay on the penultimate segment rather than the
      // server's shared segment.
      const shared = action.sharedReplay;
      state.replay.shared = {
        segment: penultimateSegment,
        useSharedSegments: !inInGameReplay,
        leader: action.leader,
        amLeader: action.leader === state.metadata.ourUsername,
        datetimeReplayStarted: shared.replayStartedAt,
        spoilerFree: shared.spoilerFree,
        canPlayAgain: shared.canPlayAgain,
        restartDeclined: castDraft(shared.restartDeclined),
        hypothetical: undefined,
      };

      break;
    }

    case "init": {
      state.datetimeStarted = action.startedAt;
      state.datetimeFinished = action.finishedAt;

      const { mode } = action;
      switch (mode.type) {
        case "playing": {
          break;
        }

        case "spectating": {
          state.playing = false;
          break;
        }

        case "shadowing": {
          state.playing = false;
          state.shadowing = true;
          break;
        }

        case "replay":
        case "sharedReplay": {
          state.playing = false;
          state.shadowing = false;
          state.finished = true;
          state.replay.segment = 0; // In dedicated solo replays, start on the first segment
          state.replay.gameId = mode.gameId;

          if (mode.type === "sharedReplay") {
            const shared = mode.sharedReplay;
            // In dedicated shared replays, start on the shared replay turn.
            state.replay.segment = shared.turn;
            state.replay.shared = {
              segment: shared.turn,
              useSharedSegments: true,
              leader: action.leader ?? "",
              amLeader: action.leader === state.metadata.ourUsername,
              datetimeReplayStarted: shared.replayStartedAt,
              spoilerFree: shared.spoilerFree,
              canPlayAgain: shared.canPlayAgain,
              restartDeclined: castDraft(shared.restartDeclined),
              hypothetical: undefined,
            };
            state.notes.efficiencyModifier = shared.efficiencyModifier;
          }
          break;
        }
      }

      break;
    }

    case "replayEnter":
    case "replayExit":
    case "replaySegment":
    case "replaySharedSegment":
    case "replayUseSharedSegments":
    case "replayLeader":
    case "restartDeclined":
    case "hypotheticalStart":
    case "hypotheticalBack":
    case "hypotheticalEnd":
    case "hypotheticalAction":
    case "hypotheticalShowDrawnCards": {
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
      if (action.premove === undefined) {
        // Allow the clearing of a premove anytime. (It might be our turn and we are clearing the
        // premove prior to sending our action to the server.)
        state.premove = undefined;
      } else if (
        // Only allow premoves in ongoing games.
        !state.finished
        // Only allow premoves when it is not our turn.
        && state.ongoingGame.turn.currentPlayerIndex
          !== state.metadata.ourPlayerIndex
      ) {
        state.premove = action.premove;
      }

      break;
    }

    case "pause": {
      state.pause.playerIndex = action.playerIndex;
      state.pause.queued = action.queued;
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

    case "setEfficiencyModifier":
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
          gameReducer(
            original(state.ongoingGame),
            action,
            state.playing,
            state.shadowing,
            state.finished,
            state.replay.hypothetical !== undefined,
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
        gameReducer(
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
        shouldStoreSegment(
          state.ongoingGame.turn.segment,
          previousSegment,
          action,
        )
        && state.ongoingGame.turn.segment !== undefined
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
    const nextState = gameReducer(
      s,
      a,
      playing,
      shadowing,
      finished,
      false,
      metadata,
    );

    if (
      shouldStoreSegment(nextState.turn.segment, s.turn.segment, a)
      && nextState.turn.segment !== undefined
    ) {
      states[nextState.turn.segment] = nextState;
    }

    return nextState;
  }, initialState);

  return { game, states };
}

/**
 * We keep a copy of each card identity in the global state for convenience. After each game action,
 * check to see if we can add any new card identities (or any suit/rank information to existing card
 * identities). We cannot just replace the array every time because we need to keep the "full" deck
 * that the server sends us.
 */
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

      existingCardIdentity.suitIndex ??= newCardIdentity.suitIndex;
      existingCardIdentity.rank ??= newCardIdentity.rank;
    }
  }
}

function visualStateToShow(
  state: Draft<State>,
  action: Action,
): Draft<GameState> | undefined {
  if (state.visibleState === undefined) {
    // The state is still initializing, so do not show anything.
    return undefined;
  }

  if (state.replay.segment !== undefined) {
    if (state.replay.hypothetical === undefined) {
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
    return state.replay.states.at(-2) ?? undefined; // The penultimate segment
  }

  // Show the final segment of the current game.
  return state.ongoingGame;
}

/**
 * The server sends us "draw" actions about cards in our own hand that have scrubbed information (to
 * prevent cheating). After a game finishes, the server sends us a list of all of the card
 * identities. With those, we can go through and "fill-in" all of the scrubbed actions.
 */
function rehydrateScrubbedActions(
  state: State,
  cardIdentities: readonly CardIdentity[],
): readonly GameAction[] {
  return state.replay.actions.map((action) => {
    if (
      (action.type === "play"
        || action.type === "discard"
        || action.type === "draw")
      && action.identity === undefined
    ) {
      const cardIdentity = cardIdentities[action.order];
      assertDefined(
        cardIdentity,
        "Failed to find the card identity for an action while rehydrating the scrubbed actions.",
      );

      const { suitIndex, rank } = cardIdentity;
      if (suitIndex === undefined || rank === undefined) {
        throw new Error(
          "Failed to find the suit index or rank of a card identity for an action while rehydrating the scrubbed actions.",
        );
      }

      return {
        ...action,
        identity: { suitIndex, rank },
      };
    }

    return action;
  });
}
