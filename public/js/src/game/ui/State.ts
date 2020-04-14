export default class State {
  log: Array<any> = []; // TODO set to action log message object
  deck: Array<StateCard> = [];
  deckSize: number = 0;
  score: number = 0;
  maxScore: number = 0;
  clueTokens: number = 8;
  doubleDiscard: boolean = false;
  strikes: number = 0;
  pace: number = 0;
  currentPlayerIndex: number = 0;
  hands: Array<Array<number>> = [];
  playStacks: Array<Array<number>> = [];
  playStacksDirections: Array<number> = [];
  discardStacks: Array<Array<number>> = [];
  clues: Array<StateClue> = [];
}

interface StateCard {
  suit: number;
  rank: number;
  clues: Array<StateCardClue>;
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
