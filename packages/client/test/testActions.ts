// Helper functions to build actions with a compact syntax. For use in tests.

import type { ColorIndex, Rank, RankClueNumber, SuitIndex } from "@hanabi/data";
import { ClueType } from "../src/game/types/ClueType";
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

export function colorClue(
  value: ColorIndex,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: ClueType.Color,
      value,
    },
    giver,
    list,
    target,
    turn,
    ignoreNegative: false,
  };
}

export function rankClue(
  value: RankClueNumber,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: ClueType.Rank,
      value,
    },
    giver,
    list,
    target,
    turn,
    ignoreNegative: false,
  };
}

export function draw(
  playerIndex: number,
  order: number,
  suitIndex: SuitIndex | -1 = -1,
  rank: Rank | -1 = -1,
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
  suitIndex: SuitIndex | -1,
  rank: Rank | -1,
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
  suitIndex: SuitIndex,
  rank: Rank,
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
  suitIndex: SuitIndex,
  rank: Rank,
): ActionCardIdentity {
  return {
    type: "cardIdentity",
    playerIndex,
    order,
    suitIndex,
    rank,
  };
}

export function strike(
  num: 1 | 2 | 3,
  order: number,
  turn: number,
): ActionStrike {
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
