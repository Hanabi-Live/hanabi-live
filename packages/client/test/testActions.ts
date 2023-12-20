/* eslint-disable @typescript-eslint/no-restricted-imports */

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
    spectating: false,
    shadowing: false,
    replay: true,
    sharedReplay: true,
    databaseID: 1,
    sharedReplaySegment: 0,
    sharedReplayLeader: "",
    paused: false,
    pausePlayerIndex: 0,
  };
}

export function hypoStart(): ActionHypotheticalStart {
  return {
    type: "hypoStart",
    showDrawnCards: false,
    actions: [],
  };
}

export function hypoEnd(): ActionHypotheticalEnd {
  return {
    type: "hypoEnd",
  };
}

export function hypoAction(
  action: ActionIncludingHypothetical,
): ActionHypotheticalAction {
  return {
    type: "hypoAction",
    action,
  };
}

export function hypoBack(): ActionHypotheticalBack {
  return {
    type: "hypoBack",
  };
}
