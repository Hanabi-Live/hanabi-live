// The reducer for replays and hypotheticals.

import type {
  GameMetadata,
  HypotheticalState,
  HypotheticalStateAction,
} from "@hanabi-live/game";
import {
  hypotheticalStateReducer,
  initializeHypotheticalState,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import type { ReplayState } from "../types/ReplayState";
import type { ReplayAction } from "../types/actions";

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
      assertDefined(
        state.shared,
        `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
      );

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
      assertDefined(
        state.shared,
        `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
      );

      state.shared.useSharedSegments = action.useSharedSegments;

      // If we are the replay leader and we are re-enabling shared segments, we also want to update
      // the shared segment to our current segment.
      if (state.shared.amLeader && state.shared.useSharedSegments) {
        state.shared.segment = state.segment;
      }

      break;
    }

    case "replayLeader": {
      assertDefined(
        state.shared,
        `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
      );

      state.shared.leader = action.username;
      state.shared.amLeader = action.username === metadata.ourUsername;
      break;
    }

    case "restartDeclined": {
      assertDefined(
        state.shared,
        `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
      );

      state.shared.restartDeclined = castDraft(action.usernames);
      break;
    }

    // --------------------
    // Hypothetical actions
    // --------------------

    case "hypoStart": {
      if (getHypothetical(state) !== undefined) {
        throw new Error(
          `A "${action.type}" action was dispatched with a non-null hypothetical state.`,
        );
      }

      // In shared replays, the hypothetical starts on the shared segment, even if we are looking at
      // a different segment.
      const segment = state.shared?.segment ?? state.segment;
      if (state.shared?.useSharedSegments === true) {
        state.segment = segment;
      }
      const ongoing = state.states[segment];
      assertDefined(
        ongoing,
        `Failed to get the game state for segment: ${segment}`,
      );

      const hypothetical = initializeHypotheticalState(
        original(ongoing),
        action.showDrawnCards,
        action.actions,
        finished,
        metadata,
      );
      setHypothetical(state, castDraft(hypothetical));

      break;
    }

    case "hypoEnd": {
      assertDefined(
        getHypothetical(state),
        `A "${action.type}" action was dispatched with a undefined hypothetical state.`,
      );

      setHypothetical(state, undefined);
      break;
    }

    case "hypoBack":
    case "hypoShowDrawnCards":
    case "hypoAction": {
      const hypotheticalDraft = getHypothetical(state);
      assertDefined(
        hypotheticalDraft,
        `A "${action.type}" action was dispatched with a undefined hypothetical state.`,
      );

      const hypothetical = original(hypotheticalDraft);
      let coreAction: HypotheticalStateAction;
      if (action.type === "hypoAction") {
        coreAction = action.action;
      } else if (action.type === "hypoBack") {
        coreAction = { type: "back" };
      } else {
        coreAction = {
          type: "showDrawnCards",
          showDrawnCards: action.showDrawnCards,
        };
      }
      setHypothetical(
        state,
        castDraft(
          hypotheticalStateReducer(
            hypothetical,
            coreAction,
            finished,
            metadata,
          ),
        ),
      );
      break;
    }
  }

  // In shared replays, we only show the leader's hypothetical while we use the shared segments.
  if (state.shared !== undefined) {
    state.hypothetical = state.shared.useSharedSegments
      ? state.shared.hypothetical
      : undefined;
  }
}

/** In shared replays, the leader's hypothetical exists even when we do not show it. */
function getHypothetical(
  state: Draft<ReplayState>,
): Draft<HypotheticalState> | undefined {
  return state.shared === undefined
    ? state.hypothetical
    : state.shared.hypothetical;
}

function setHypothetical(
  state: Draft<ReplayState>,
  hypothetical: Draft<HypotheticalState> | undefined,
) {
  if (state.shared === undefined) {
    state.hypothetical = hypothetical;
  } else {
    state.shared.hypothetical = hypothetical;
  }
}
