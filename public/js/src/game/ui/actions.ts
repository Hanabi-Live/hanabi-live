// Imports
import MsgClue from './MsgClue';
import SimpleCard from './SimpleCard';

// Action is a message sent to the server that represents the in-game action that we just took
export interface Action {
  type: number;
  target: number;
  value?: number;
}

export interface ActionDraw {
  type: string;
  who: number;
  rank: number;
  suit: number;
  order: number;
}

export interface ActionStatus {
  type: string;
  clues: number;
  score: number;
  maxScore: number;
  doubleDiscard: boolean;
}

export interface ActionStackDirections {
  type: string;
  directions: number[];
}

export interface ActionText {
  type: string;
  text: string;
}

export interface ActionTurn {
  type: string;
  num: number;
  who: number;
}

export interface ActionClue {
  type: string;
  clue: MsgClue;
  giver: number;
  list: number[];
  target: number;
  turn: number;
}

export interface ActionPlay {
  type: string;
  which: Which;
}

export interface ActionDiscard {
  type: string;
  failed: boolean;
  which: Which;
}

export interface ActionReorder {
  type: string;
  target: number;
  handOrder: number[];
}

export interface ActionStrike {
  type: string;
  num: number; // 1 for the first strike, 2 for the second strike, etc.
  order: number; // The order of the card that was misplayed
  turn: number;
}

export interface ActionDeckOrder {
  type: string;
  deck: SimpleCard[];
}

interface Which {
  index: number;
  suit: number;
  rank: number;
  order: number;
}
