// Helper functions to build actions with a compact syntax
// For use in tests

import {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionHypotheticalStart,
  ActionHypotheticalBack,
  ActionHypotheticalEnd,
  ActionHypothetical,
  ActionIncludingHypothetical,
  ActionPlay,
  ActionReplayEnter,
  ActionReplayExit,
  ActionStrike,
  ActionTurn,
} from '../src/game/types/actions';
import ClueType from '../src/game/types/ClueType';

const clue = (
  type: ClueType,
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => ({
  type: 'clue',
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
): ActionClue => clue(
  ClueType.Color,
  value,
  giver,
  list,
  target,
  turn,
);

export const rankClue = (
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => clue(
  ClueType.Rank,
  value,
  giver,
  list,
  target,
  turn,
);

export const draw = (
  playerIndex: number,
  order: number,
  suitIndex: number = -1,
  rank: number = -1,
): ActionDraw => ({
  type: 'draw',
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
  type: 'discard',
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
  type: 'play',
  playerIndex,
  order,
  suitIndex,
  rank,
});

export const strike = (num: number, order: number, turn: number): ActionStrike => ({
  type: 'strike',
  num,
  order,
  turn,
});

export const turn = (num: number, currentPlayerIndex: number): ActionTurn => ({
  type: 'turn',
  num,
  currentPlayerIndex,
});

export const enterReplay = (): ActionReplayEnter => ({
  type: 'replayEnter',
  segment: 0,
});

export const endReplay = (): ActionReplayExit => ({
  type: 'replayExit',
});

export const hypoStart = (): ActionHypotheticalStart => ({
  type: 'hypoStart',
  drawnCardsShown: false,
});

export const hypoEnd = (): ActionHypotheticalEnd => ({
  type: 'hypoEnd',
});

export const hypoBack = (): ActionHypotheticalBack => ({
  type: 'hypoBack',
});

export const hypoAction = (action: ActionIncludingHypothetical): ActionHypothetical => ({
  type: 'hypoAction',
  action,
});
