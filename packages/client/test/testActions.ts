// Helper functions to build actions with a compact syntax. For use in tests.

import {
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
  ActionReplayExit,
  ActionStrike,
  ActionTurn,
} from "../src/game/types/actions";
import ClueType from "../src/game/types/ClueType";

const clue = (
  type: ClueType,
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => ({
  type: "clue",
  clue: {
    type,
    value,
  },
  giver,
  list,
  target,
  turn,
});

export const colorClue = (
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => clue(ClueType.Color, value, giver, list, target, turn);

export const rankClue = (
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => clue(ClueType.Rank, value, giver, list, target, turn);

export const draw = (
  playerIndex: number,
  order: number,
  suitIndex = -1,
  rank = -1,
): ActionDraw => ({
  type: "draw",
  playerIndex,
  order,
  suitIndex,
  rank,
});

export const discard = (
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
  failed: boolean,
): ActionDiscard => ({
  type: "discard",
  playerIndex,
  order,
  suitIndex,
  rank,
  failed,
});

export const play = (
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
): ActionPlay => ({
  type: "play",
  playerIndex,
  order,
  suitIndex,
  rank,
});

export const cardIdentity = (
  playerIndex: number,
  order: number,
  suitIndex: number,
  rank: number,
): ActionCardIdentity => ({
  type: "cardIdentity",
  playerIndex,
  order,
  suitIndex,
  rank,
});

export const strike = (
  num: number,
  order: number,
  turn: number,
): ActionStrike => ({
  type: "strike",
  num,
  order,
  turn,
});

// ts-prune-ignore-next
export const turn = (num: number, currentPlayerIndex: number): ActionTurn => ({
  type: "turn",
  num,
  currentPlayerIndex,
});

export const replayEnter = (): ActionReplayEnter => ({
  type: "replayEnter",
  segment: 0,
});

export const init = (): ActionInit => ({
  type: "init",
  datetimeStarted: new Date(0).toString(),
  datetimeFinished: new Date(0).toString(),
  spectating: false,
  replay: true,
  sharedReplay: true,
  databaseID: 1,
  sharedReplaySegment: 0,
  sharedReplayLeader: "",
  paused: false,
  pausePlayerIndex: 0,
});

// ts-prune-ignore-next
export const endReplay = (): ActionReplayExit => ({
  type: "replayExit",
});

export const hypoStart = (): ActionHypotheticalStart => ({
  type: "hypoStart",
  showDrawnCards: false,
  actions: [],
});

export const hypoEnd = (): ActionHypotheticalEnd => ({
  type: "hypoEnd",
});

export const hypoAction = (
  action: ActionIncludingHypothetical,
): ActionHypotheticalAction => ({
  type: "hypoAction",
  action,
});

export const hypoBack = (): ActionHypotheticalBack => ({
  type: "hypoBack",
});
