import * as stats from '../ui/stats';
import { MAX_CLUE_NUM, DEFAULT_VARIANT_NAME } from './constants';
import Variant from './Variant';

export default class State {
  // Using a string instead of an object to keep this object as flat as possible since it is cloned
  // often
  variantName: Variant['name'] = DEFAULT_VARIANT_NAME;
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

  constructor(variant: Variant, playerCount: number) {
    this.variantName = variant.name;

    this.deckSize = stats.getTotalCardsInTheDeck(variant);
    this.maxScore = variant.maxScore;
    for (let i = 0; i < playerCount; i++) {
      this.hands.push([]);
    }
    for (let i = 0; i < variant.suits.length; i++) {
      this.playStacks.push([]);
      this.discardStacks.push([]);
    }
  }
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
