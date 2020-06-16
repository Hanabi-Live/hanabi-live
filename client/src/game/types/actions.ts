import MsgClue from './MsgClue';
import { SimpleCard } from './SimpleCard';

export type Action =
| ActionClue
| ActionDeckOrder
| ActionDiscard
| ActionDraw
| ActionPlay
| ActionReorder
| ActionStackDirections
| ActionStatus
| ActionStrike
| ActionText
| ActionTurn;

export type ActionIncludingHypothetical = Action | ActionReveal;

export interface ActionClue {
  type: 'clue';
  readonly clue: MsgClue;
  readonly giver: number;
  readonly list: number[];
  readonly target: number;
  readonly turn: number;
}

export interface ActionDeckOrder {
  type: 'deckOrder';
  readonly deck: SimpleCard[];
}

export interface ActionDiscard {
  type: 'discard';
  readonly failed: boolean;
  readonly which: Which;
}

export interface ActionDraw {
  type: 'draw';
  readonly who: number;
  readonly rank: number;
  readonly suit: number;
  readonly order: number;
}

export interface ActionPlay {
  type: 'play';
  readonly which: Which;
}

export interface ActionReorder {
  type: 'reorder';
  readonly target: number;
  readonly handOrder: number[];
}

export interface ActionStackDirections {
  type: 'stackDirections';
  readonly directions: number[];
}

export interface ActionStatus {
  type: 'status';
  readonly clues: number;
  readonly score: number;
  readonly maxScore: number;
  readonly doubleDiscard: boolean;
}

export interface ActionStrike {
  type: 'strike';
  readonly num: number; // 1 for the first strike, 2 for the second strike, etc.
  readonly order: number; // The order of the card that was misplayed
  readonly turn: number;
}

export interface ActionText {
  type: 'text';
  readonly text: string;
}

export interface ActionTurn {
  type: 'turn';
  readonly num: number;
  readonly who: number;
}

export interface Which {
  readonly index: number;
  readonly suit: number;
  readonly rank: number;
  readonly order: number;
}

// Hypothetical only
export interface ActionReveal {
  type: 'reveal';
  suit: number;
  rank: number;
  order: number;
}
