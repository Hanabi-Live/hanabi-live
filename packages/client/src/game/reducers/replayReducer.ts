// The reducer for replays and hypotheticals.

import type { GameMetadata, HypotheticalStateAction } from "@hanabi-live/game";
import {
  hypotheticalStateReducer,
  initializeHypotheticalState,
} from "@hanabi-live/game";
import { assertDefined, assertNotNull } from "complete-common";
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
      assertNotNull(
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
      assertNotNull(
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
      assertNotNull(
        state.shared,
        `A "${action.type}" action was dispatched, but we are not in a shared replay.`,
      );

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

      const ongoing = state.states[state.segment];
      assertDefined(
        ongoing,
        `Failed to get the game state for segment: ${state.segment}`,
      );

      const originalOngoing = original(ongoing);
      assertDefined(originalOngoing, "Failed to get the original game state.");
      state.hypothetical = castDraft(
        initializeHypotheticalState(
          originalOngoing,
          action.showDrawnCards,
          action.actions,
          finished,
          metadata,
        ),
      );

      break;
    }

    case "hypoEnd": {
      assertNotNull(
        state.hypothetical,
        `A "${action.type}" action was dispatched with a null hypothetical state.`,
      );

      state.hypothetical = null;
      break;
    }

    case "hypoBack":
    case "hypoShowDrawnCards":
    case "hypoAction": {
      assertNotNull(
        state.hypothetical,
        `A "${action.type}" action was dispatched with a null hypothetical state.`,
      );

      const hypothetical = original(state.hypothetical);
      assertDefined(
        hypothetical,
        "Failed to get the original hypothetical state.",
      );
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
      state.hypothetical = castDraft(
        hypotheticalStateReducer(hypothetical, coreAction, finished, metadata),
      );
      break;
    }
  }
}
