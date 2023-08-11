// Helper functions to build actions with a compact syntax. For use in tests.

import type {
  ActionCardIdentity,
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionHypotheticalAction,
  ActionHypotheticalBack,
  ActionHypotheticalEnd,
  ActionHypotheticalStart,
  ActionIncludingHypothetical,
  ActionInit,
  ActionPlay,
  ActionReplayEnter,
  ActionStrike,
} from "../src/game/types/actions";
import { ClueType } from "../src/game/types/ClueType";

function clue(
  type: ClueType,
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type,
      value,
    },
    giver,
    list,
    target,
    turn,
    ignoreNegative: false,
  };
}

export function colorClue(
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue {
  return clue(ClueType.Color, value, giver, list, target, turn);
}

export function rankClue(
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue {
  return clue(ClueType.Rank, value, giver, list, target, turn);
}

export function draw(
  playerIndex: number,
  order: number,
  suitIndex = -1,
  rank = -1,
): ActionDraw {
  return {
    type: "draw",
    playerIndex,
    order,
    suitIndex,
    rank,
  };
}

export function discard(
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
  failed: boolean,
): ActionDiscard {
  return {
    type: "discard",
    playerIndex,
    order,
    suitIndex,
    rank,
    failed,
  };
}

export function play(
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
): ActionPlay {
  return {
    type: "play",
    playerIndex,
    order,
    suitIndex,
    rank,
  };
}

export function cardIdentity(
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
): ActionCardIdentity {
  return {
    type: "cardIdentity",
    playerIndex,
    order,
    suitIndex,
    rank,
  };
}

export function strike(num: number, order: number, turn: number): ActionStrike {
  return {
    type: "strike",
    num,
    order,
    turn,
  };
}

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
