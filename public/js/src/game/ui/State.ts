export default class State {
  log: any[] = []; // TODO set to action log message object
  deck: StateCard[] = [];
  deckSize: number = 0;
  score: number = 0;
  maxScore: number = 0;
  clueTokens: number = 8;
  doubleDiscard: boolean = false;
  strikes: number = 0;
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
