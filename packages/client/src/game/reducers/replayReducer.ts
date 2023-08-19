// The reducer for replays and hypotheticals.

import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import type { GameMetadata } from "../types/GameMetadata";
import type { ReplayState } from "../types/ReplayState";
import type {
  ActionIncludingHypothetical,
  ReplayAction,
} from "../types/actions";
import { gameStateReducer } from "./gameStateReducer";

export const replayReducer = produce(replayReducerFunction, {} as ReplayState);

function replayReducerFunction(
  state: Draft<ReplayState>,
  action: ReplayAction,
  finished: boolean,
  metadata: GameMetadata,
) {
  // Validate current state
  if (!state.active && action.type !== "replayEnter") {
    throw new Error(
      `A "${action.type}" action was dispatched, but we are not in a replay.`,
    );
  }

  switch (action.type) {
    // --------------
    // Replay actions
    // --------------

    case "replayEnter": {
      if (state.active) {
        throw new Error(
          `A "${action.type}" action was dispatched, but we are already in a replay.`,
        );
      }
      state.active = true;

      if (typeof action.segment !== "number") {
        throw new TypeError(
          `The "${action.type}" action segment was not a number.`,
        );
      }
      if (action.segment < 0) {
        throw new Error(`The "${action.type}" action segment was less than 0.`);
      }
      state.segment = action.segment;

      break;
    }

    case "replayExit": {
      state.active = false;
      state.segment = 0;

      break;
    }

    case "replaySegment": {
      if (typeof action.segment !== "number") {
        throw new TypeError(
          `The "${action.type}" action segment was not a number.`,
        );
      }
      if (action.segment < 0) {
        throw new Error(`The "${action.type}" action segment was less than 0.`);
      }
      state.segment = action.segment;

      break;
    }

    case "replaySharedSegment": {
      if (state.shared === null) {
        throw new Error(
          `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
        );
      }
      if (typeof action.segment !== "number") {
        throw new TypeError(
          `The "${action.type}" action segment was not a number.`,
        );
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

    case "replayUseSharedSegments": {
      if (state.shared === null) {
        throw new Error(
          `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
        );
      }
      state.shared.useSharedSegments = action.useSharedSegments;

      // If we are the replay leader and we are re-enabling shared segments, we also want to update
      // the shared segment to our current segment.
      if (state.shared.amLeader && state.shared.useSharedSegments) {
        state.shared.segment = state.segment;
      }

      break;
    }

    case "replayLeader": {
      if (state.shared === null) {
        throw new Error(
          `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
        );
      }
      state.shared.leader = action.name;
      state.shared.amLeader = action.name === metadata.ourUsername;
      break;
    }

    // --------------------
    // Hypothetical actions
    // --------------------

    case "hypoStart": {
      if (state.hypothetical !== null) {
        throw new Error(
          `A "${action.type}" action was dispatched with a non-null hypothetical state.`,
        );
      }
      if (state.shared !== null) {
        // Bring us to the current shared replay turn, if we are not already there
        state.segment = state.shared.segment;
        state.shared.useSharedSegments = true;
      }

      const ongoing = state.states[state.segment]!;
      const startingPlayerIndex = ongoing.turn.currentPlayerIndex;

      state.hypothetical = {
        ongoing,
        states: [ongoing],
        showDrawnCards: action.showDrawnCards,
        drawnCardsInHypothetical: [],
        morphedIdentities: [],
        startingPlayerIndex,
      };

      for (const a of action.actions) {
        hypoAction(state, a, finished, metadata);
      }

      break;
    }

    case "hypoEnd": {
      if (state.hypothetical === null) {
        throw new Error(
          `A "${action.type}" action was dispatched with a null hypothetical state.`,
        );
      }

      state.hypothetical = null;
      break;
    }

    case "hypoBack": {
      if (state.hypothetical === null) {
        throw new Error(
          `A "${action.type}" action was dispatched with a null hypothetical state.`,
        );
      }

      const hypoStates = state.hypothetical.states;
      hypoStates.pop();
      const lastState = hypoStates.at(-1)!;
      state.hypothetical.ongoing = lastState;
      break;
    }

    case "hypoShowDrawnCards": {
      if (state.hypothetical === null) {
        throw new Error(
          `A "${action.type}" action was dispatched with a null hypothetical state.`,
        );
      }

      state.hypothetical.showDrawnCards = action.showDrawnCards;

      for (const order of original(
        state.hypothetical.drawnCardsInHypothetical,
      )!) {
        if (action.showDrawnCards) {
          // This is a sparse array, so we must delete it with the `delete` operator. (We are not
          // using a map because Immer state objects must be composed of primitives for performance
          // reasons.)
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete state.hypothetical.morphedIdentities[order];
        } else {
          // Hide all cards drawn since the beginning of the hypothetical.
          state.hypothetical.morphedIdentities[order] = {
            rank: null,
            suitIndex: null,
          };
        }
      }

      break;
    }

    case "hypoAction": {
      if (state.hypothetical === null) {
        throw new Error(
          `A "${action.type}" action was dispatched with a null hypothetical state.`,
        );
      }

      hypoAction(state, action.action, finished, metadata);
      break;
    }
  }
}

function hypoAction(
  state: Draft<ReplayState>,
  action: ActionIncludingHypothetical,
  finished: boolean,
  metadata: GameMetadata,
) {
  if (state.hypothetical === null) {
    throw new Error(
      'A "hypoAction" action was dispatched with a null hypothetical state.',
    );
  }

  // The morph action is handled here. Also take note of any draws that conflict with the known card
  // identities.
  if (action.type === "morph") {
    const suitIndex = action.suitIndex === -1 ? null : action.suitIndex;
    const rank = action.rank === -1 ? null : action.rank;

    state.hypothetical.morphedIdentities[action.order] = {
      suitIndex,
      rank,
    };
  } else if (action.type === "unmorph") {
    // This is a sparse array, so we must delete it with the `delete` operator. (We are not using a
    // map because Immer state objects must be composed of primitives for performance reasons.)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete state.hypothetical.morphedIdentities[action.order];
  }

  if (action.type === "draw") {
    // Store drawn cards to be able to show/hide in the future.
    state.hypothetical.drawnCardsInHypothetical.push(action.order);
    if (!state.hypothetical.showDrawnCards) {
      // This card has been morphed or blanked.
      state.hypothetical.morphedIdentities[action.order] = {
        suitIndex: null,
        rank: null,
      };
    }
  }

  // The game state doesn't care about morphed cards.
  if (action.type === "morph" || action.type === "unmorph") {
    return;
  }

  const isClueActionThatShouldIgnoreNegative =
    action.type === "clue" &&
    !state.hypothetical.showDrawnCards &&
    state.hypothetical.startingPlayerIndex === action.target;
  const newAction = isClueActionThatShouldIgnoreNegative
    ? {
        ...action,
        ignoreNegative: true,
      }
    : action;

  const oldSegment = state.hypothetical.ongoing.turn.segment;
  const newState = gameStateReducer(
    state.hypothetical.ongoing,
    newAction,
    true,
    false,
    finished,
    true,
    metadata,
  );
  state.hypothetical.ongoing = castDraft(newState);

  if (oldSegment !== newState.turn.segment) {
    // Save the new segment in case we want to go backwards.
    state.hypothetical.states.push(castDraft(newState));
  }
}
