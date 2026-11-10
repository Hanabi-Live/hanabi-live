/* eslint-disable @typescript-eslint/no-restricted-imports */

import { gameIdSchema } from "@hanabi-live/game";
import type {
  ActionHypotheticalAction,
  ActionHypotheticalBack,
  ActionHypotheticalEnd,
  ActionHypotheticalStart,
  ActionIncludingHypothetical,
  ActionInit,
  ActionReplayEnter,
} from "../src/game/types/actions";

export function replayEnter(): ActionReplayEnter {
  return {
    type: "replayEnter",
    segment: 0,
  };
}

export function init(): ActionInit {
  return {
    type: "init",
    datetimeStarted: new Date(0).toString(),
    datetimeFinished: new Date(0).toString(),
    mode: "sharedReplay",
    gameID: gameIdSchema.parse(1),
    sharedReplay: {
      leader: "",
      segment: 0,
      efficiencyModifier: 0,
      spoilerFree: false,
      canPlayAgain: false,
      datetimeStarted: new Date(0).toString(),
    },
    pauseQueued: false,
  };
}

export function hypoStart(shared = false): ActionHypotheticalStart {
  return {
    type: "hypoStart",
    shared,
    showDrawnCards: false,
    actions: [],
  };
}

export function hypoEnd(shared = false): ActionHypotheticalEnd {
  return {
    type: "hypoEnd",
    shared,
  };
}

export function hypoAction(
  action: ActionIncludingHypothetical,
  shared = false,
): ActionHypotheticalAction {
  return {
    type: "hypoAction",
    shared,
    action,
  };
}

export function hypoBack(): ActionHypotheticalBack {
  return {
    type: "hypoBack",
    shared: false,
  };
}
