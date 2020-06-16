import * as deck from '../rules/deck';
import { MAX_CLUE_NUM } from './constants';
import StackDirection from './StackDirection';
import Variant from './Variant';

export default interface State {
  // Using a string instead of an object to keep this object
  // as flat as possible since it is cloned often
  readonly variantName: Variant['name'],
  readonly log: string[], // TODO set to action log message object
  readonly deck: StateCard[],
  readonly deckSize: number,
  readonly score: number,
  readonly maxScore: number,
  readonly clueTokens: number,
  readonly doubleDiscard: boolean,
  readonly strikes: StateStrike[],
  readonly pace: number,
  readonly currentPlayerIndex: number,
  readonly hands: number[][],
  readonly playStacks: number[][],
  readonly playStacksDirections: StackDirection[],
  readonly discardStacks: number[][],
  readonly clues: StateClue[],
}

export const initialState = (variant: Variant, playerCount: number) => {
  const state: State = {
    variantName: variant.name,
    log: [],
    deck: [],
    deckSize: deck.totalCards(variant),
    score: 0,
    maxScore: variant.maxScore,
    clueTokens: MAX_CLUE_NUM,
    doubleDiscard: false,
    strikes: [],
    pace: 0,
    currentPlayerIndex: 0,
    hands: [],
    playStacks: [],
    playStacksDirections: [],
    discardStacks: [],
    clues: [],
  };

  for (let i = 0; i < playerCount; i++) {
    state.hands.push([]);
  }
  for (let i = 0; i < variant.suits.length; i++) {
    state.playStacksDirections.push(StackDirection.Undecided);
    state.playStacks.push([]);
    state.discardStacks.push([]);
  }

  return state;
};

interface StateCard {
  readonly suit: number;
  readonly rank: number;
  readonly clues: StateCardClue[];
}

interface StateStrike {
  readonly order: number;
  readonly turn: number;
}

interface StateClue {
  readonly type: number;
  readonly value: number;
  readonly giver: number;
  readonly target: number;
  readonly turn: number;
}

interface StateCardClue {
  readonly type: number;
  readonly value: number;
  readonly positive: boolean;
}
