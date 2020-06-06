import { MAX_CLUE_NUM } from '../../constants';

export default class State {
  log: string[] = []; // TODO set to action log message object
  deck: StateCard[] = [];
  deckSize: number = 0;
  score: number = 0;
  maxScore: number = 0;
  clueTokens: number = MAX_CLUE_NUM;
  doubleDiscard: boolean = false;
  strikes: StateStrike[] = [];
  pace: number = 0;
  currentPlayerIndex: number = 0;
  hands: number[][] = [];
  playStacks: number[][] = [];
  playStacksDirections: number[] = [];
  discardStacks: number[][] = [];
  clues: StateClue[] = [];
}

interface StateCard {
  suit: number;
  rank: number;
  clues: StateCardClue[];
}

interface StateStrike {
  order: number;
  turn: number;
}

interface StateClue {
  type: number;
  value: number;
  giver: number;
  target: number;
  turn: number;
}

interface StateCardClue {
  type: number;
  value: number;
  positive: boolean;
}
