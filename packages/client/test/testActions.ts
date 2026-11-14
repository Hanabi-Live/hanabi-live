/* eslint-disable @typescript-eslint/no-restricted-imports */

import { gameIdSchema } from "@hanabi-live/data";
import type {
  ActionHypotheticalActions,
  ActionHypotheticalBack,
  ActionHypotheticalEnd,
  ActionHypotheticalStart,
  ActionIncludingHypothetical,
  ActionInit,
  ActionReplayEnter,
} from "../src/game/types/actions.ts";

export function replayEnter(): ActionReplayEnter {
  return {
    type: "replayEnter",
    segment: 0,
  };
}

export function init(): ActionInit {
  return {
    type: "init",
    startedAt: new Date(0).toString(),
    finishedAt: new Date(0).toString(),
    mode: {
      type: "sharedReplay",
      gameId: gameIdSchema.parse(1),
      spoilerFree: false,
      canPlayAgain: false,
      replayStartedAt: new Date(0).toString(),
    },
  };
}

export function hypoStart(shared = false): ActionHypotheticalStart {
  return {
    type: "hypotheticalStart",
    shared,
    showDrawnCards: false,
    actions: [],
  };
}

export function hypoEnd(shared = false): ActionHypotheticalEnd {
  return {
    type: "hypotheticalEnd",
    shared,
  };
}

export function hypoAction(
  action: ActionIncludingHypothetical,
  shared = false,
): ActionHypotheticalActions {
  return {
    type: "hypotheticalActions",
    shared,
    actions: [action],
  };
}

export function hypoBack(): ActionHypotheticalBack {
  return {
    type: "hypotheticalBack",
    shared: false,
  };
}
