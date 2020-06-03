// Imports
import { ActionType } from '../../constants';
import MsgClue from './MsgClue';
import { SimpleCard } from './SimpleCard';

export type Action =
  | ActionDraw
  | ActionStatus
  | ActionStackDirections
  | ActionText
  | ActionTurn
  | ActionClue
  | ActionPlay
  | ActionDiscard
  | ActionReorder
  | ActionStrike
  | ActionDeckOrder;

// Action is a message sent to the server that represents the in-game action that we just took
export interface ClientAction {
  type: ActionType;
  target: number;
  value?: number;
}

export interface ActionDraw {
  type: 'draw';
  who: number;
  rank: number;
  suit: number;
  order: number;
}

export interface ActionStatus {
  type: 'status';
  clues: number;
  score: number;
  maxScore: number;
  doubleDiscard: boolean;
}

export interface ActionStackDirections {
  type: 'stackDirections';
  directions: number[];
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

export interface ActionClue {
  type: 'clue';
  clue: MsgClue;
  giver: number;
  list: number[];
  target: number;
  turn: number;
}

export interface ActionPlay {
  type: 'play';
  which: Which;
}

export interface ActionDiscard {
  type: 'discard';
  failed: boolean;
  which: Which;
}

export interface ActionReorder {
  type: 'reorder';
  target: number;
  handOrder: number[];
}

export interface ActionStrike {
  type: 'strike';
  num: number; // 1 for the first strike, 2 for the second strike, etc.
  order: number; // The order of the card that was misplayed
  turn: number;
}

export interface ActionDeckOrder {
  type: 'deckOrder';
  deck: SimpleCard[];
}

interface Which {
  index: number;
  suit: number;
  rank: number;
  order: number;
}
