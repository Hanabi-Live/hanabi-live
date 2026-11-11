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
import type { ReplayState } from "../types/ReplayState.ts";
import type { ReplayAction } from "../types/actions.ts";

export const replayReducer = produce(replayReducerFunction, {} as ReplayState);

function replayReducerFunction(
  state: Draft<ReplayState>,
  action: ReplayAction,
  finished: boolean,
  metadata: GameMetadata,
) {
  if (action.type === "replayEnter") {
    if (state.segment !== undefined) {
      throw new Error(
        `A "${action.type}" action was dispatched, but we are already in a replay.`,
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
    state.segment = action.segment;
    return;
  }

  // Validate current state
  const { segment } = state;
  if (segment === undefined) {
    throw new Error(
      `A "${action.type}" action was dispatched, but we are not in a replay.`,
    );
  }

  switch (action.type) {
    // --------------
    // Replay actions
    // --------------

    case "replayExit": {
      state.segment = undefined;

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
        state.shared.segment = segment;
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

      state.shared.restartDeclined = castDraft(action.restartDeclined);
      break;
    }

    // --------------------
    // Hypothetical actions
    // --------------------

    case "hypotheticalStart": {
      if (getHypothetical(state, action.shared) !== undefined) {
        throw new Error(
          `A "${action.type}" action was dispatched with a non-null hypothetical state.`,
        );
      }

      // The leader's hypothetical starts on the shared segment, even if we are looking at a
      // different segment.
      let startSegment = segment;
      if (action.shared && state.shared !== undefined) {
        startSegment = state.shared.segment;
        if (state.shared.useSharedSegments) {
          state.segment = startSegment;
        }
      }
      const ongoing = state.states[startSegment];
      assertDefined(
        ongoing,
        `Failed to get the game state for segment: ${startSegment}`,
      );

      const hypothetical = initializeHypotheticalState(
        original(ongoing),
        action.showDrawnCards,
        action.actions,
        finished,
        metadata,
      );
      setHypothetical(state, action.shared, castDraft(hypothetical));

      break;
    }

    case "hypotheticalEnd": {
      assertDefined(
        getHypothetical(state, action.shared),
        `A "${action.type}" action was dispatched with a undefined hypothetical state.`,
      );

      setHypothetical(state, action.shared, undefined);
      break;
    }

    case "hypotheticalBack":
    case "hypotheticalShowDrawnCards":
    case "hypotheticalAction": {
      const hypotheticalDraft = getHypothetical(state, action.shared);
      assertDefined(
        hypotheticalDraft,
        `A "${action.type}" action was dispatched with a undefined hypothetical state.`,
      );

      const hypothetical = original(hypotheticalDraft);
      let coreAction: HypotheticalStateAction;
      if (action.type === "hypotheticalAction") {
        coreAction = action.action;
      } else if (action.type === "hypotheticalBack") {
        coreAction = { type: "back" };
      } else {
        coreAction = {
          type: "showDrawnCards",
          showDrawnCards: action.showDrawnCards,
        };
      }
      setHypothetical(
        state,
        action.shared,
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

  // We show our own hypothetical first. We only show the leader's hypothetical while we use the
  // shared segments.
  state.hypothetical =
    state.ownHypothetical
    ?? (state.shared?.useSharedSegments === true
      ? state.shared.hypothetical
      : undefined);
}

function getHypothetical(
  state: Draft<ReplayState>,
  shared: boolean,
): Draft<HypotheticalState> | undefined {
  if (!shared) {
    return state.ownHypothetical;
  }

  assertDefined(
    state.shared,
    "A shared hypothetical action was dispatched, but we are not in a shared replay.",
  );
  return state.shared.hypothetical;
}

function setHypothetical(
  state: Draft<ReplayState>,
  shared: boolean,
  hypothetical: Draft<HypotheticalState> | undefined,
) {
  if (!shared) {
    state.ownHypothetical = hypothetical;
    return;
  }

  assertDefined(
    state.shared,
    "A shared hypothetical action was dispatched, but we are not in a shared replay.",
  );
  state.shared.hypothetical = hypothetical;
}
