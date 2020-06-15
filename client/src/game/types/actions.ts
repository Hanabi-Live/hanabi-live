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
  clue: MsgClue;
  giver: number;
  list: number[];
  target: number;
  turn: number;
}

export interface ActionDeckOrder {
  type: 'deckOrder';
  deck: SimpleCard[];
}

export interface ActionDiscard {
  type: 'discard';
  failed: boolean;
  which: Which;
}

export interface ActionDraw {
  type: 'draw';
  who: number;
  rank: number;
  suit: number;
  order: number;
}

export interface ActionPlay {
  type: 'play';
  which: Which;
}

export interface ActionReorder {
  type: 'reorder';
  target: number;
  handOrder: number[];
}

export interface ActionStackDirections {
  type: 'stackDirections';
  directions: number[];
}

export interface ActionStatus {
  type: 'status';
  clues: number;
  score: number;
  maxScore: number;
  doubleDiscard: boolean;
}

export interface ActionStrike {
  type: 'strike';
  num: number; // 1 for the first strike, 2 for the second strike, etc.
  order: number; // The order of the card that was misplayed
  turn: number;
}

export interface ActionText {
  type: 'text';
  text: string;
}

export interface ActionTurn {
  type: 'turn';
  num: number;
  who: number;
}

export interface Which {
  index: number;
  suit: number;
  rank: number;
  order: number;
}

// Hypothetical only
export interface ActionReveal {
  type: 'reveal';
  suit: number;
  rank: number;
  order: number;
}
