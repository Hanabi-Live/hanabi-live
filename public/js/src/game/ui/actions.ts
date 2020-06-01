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
export type ClientAction = {
  type: ActionType;
  target: number;
  value?: number;
};

export type ActionDraw = {
  type: 'draw';
  who: number;
  rank: number;
  suit: number;
  order: number;
};

export type ActionStatus = {
  type: 'status';
  clues: number;
  score: number;
  maxScore: number;
  doubleDiscard: boolean;
};

export type ActionStackDirections = {
  type: 'stackDirections';
  directions: number[];
};

export type ActionText = {
  type: 'text';
  text: string;
};

export type ActionTurn = {
  type: 'turn';
  num: number;
  who: number;
};

export type ActionClue = {
  type: 'clue';
  clue: MsgClue;
  giver: number;
  list: number[];
  target: number;
  turn: number;
};

export type ActionPlay = {
  type: 'play';
  which: Which;
};

export type ActionDiscard = {
  type: 'discard';
  failed: boolean;
  which: Which;
};

export type ActionReorder = {
  type: 'reorder';
  target: number;
  handOrder: number[];
};

export type ActionStrike = {
  type: 'strike';
  num: number; // 1 for the first strike, 2 for the second strike, etc.
  order: number; // The order of the card that was misplayed
  turn: number;
};

export type ActionDeckOrder = {
  type: 'deckOrder';
  deck: SimpleCard[];
};

type Which = {
  index: number;
  suit: number;
  rank: number;
  order: number;
};
