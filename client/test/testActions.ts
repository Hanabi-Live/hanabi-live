// Helper functions to build actions with a compact syntax
// For use in tests

import {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionStrike,
  ActionText,
  ActionHypotheticalStart,
  ActionHypotheticalBack,
  ActionHypotheticalEnd,
  ActionHypothetical,
  ActionIncludingHypothetical,
  ActionStartReplay,
  ActionEndReplay,
  ActionTurn,
} from '../src/game/types/actions';
import ClueType from '../src/game/types/ClueType';

export const clue = (
  type: ClueType,
  value: number,
  giver: number,
  list: number[],
  target: number,
  turn: number,
): ActionClue => ({
  type: 'clue', clue: { type, value }, giver, list, target, turn,
});

export const draw = (who: number, rank: number, suit: number, order: number): ActionDraw => ({
  type: 'draw', who, rank, suit, order,
});

export const discard = (
  failed: boolean,
  index: number,
  suit: number,
  rank: number,
  order: number,
): ActionDiscard => ({
  type: 'discard',
  failed,
  which: {
    index, suit, rank, order,
  },
});

export const play = (
  index: number,
  suit: number,
  rank: number,
  order: number,
): ActionPlay => ({
  type: 'play',
  which: {
    index, suit, rank, order,
  },
});

export const strike = (num: number, order: number, turn: number): ActionStrike => ({
  type: 'strike', num, order, turn,
});

export const text = (textContent: string): ActionText => ({
  type: 'text', text: textContent,
});

export const turn = (num: number, who: number): ActionTurn => ({
  type: 'turn', num, who,
});

export const startReplay = (turnNumber: number): ActionStartReplay => ({
  type: 'startReplay', turn: turnNumber,
});

export const endReplay = (): ActionEndReplay => ({ type: 'endReplay' });

export const hypoStart = (): ActionHypotheticalStart => ({ type: 'hypoStart' });
export const hypoEnd = (): ActionHypotheticalEnd => ({ type: 'hypoEnd' });
export const hypoBack = (): ActionHypotheticalBack => ({ type: 'hypoBack' });
export const hypoAction = (action: ActionIncludingHypothetical): ActionHypothetical => (
  {
    type: 'hypoAction',
    action,
  }
);
