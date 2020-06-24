import Color from './Color';
import Suit from './Suit';

export default interface CardState {
  readonly order: number;
  // The index of the player that holds this card (or null if played/discarded)
  holder: number | null;
  suit: Suit | null;
  rank: number | null;
  blank: boolean;

  // The following are the variables that are refreshed
  readonly rankClueMemory: ClueMemory<number>;
  readonly colorClueMemory: ClueMemory<Color>;

  possibleCards: Map<string, number>;
  identityDetermined: boolean;
  numPositiveClues: number;
  turnsClued: number[];
  turnDrawn: number;
  isDiscarded: boolean;
  turnDiscarded: number;
  isPlayed: boolean;
  turnPlayed: number;
  isMisplayed: boolean;
}

export type PipState = 'Visible' | 'Eliminated' | 'Hidden' | 'PositiveClue';

export type Trait<V extends Color | number> =
  V extends Color ? Suit :
    V extends number ? number :
      never;

export interface ClueMemory<V extends Color | number> {
  possibilities: Array<Trait<V>>;
  positiveClues: V[];
  negativeClues: V[];
  readonly pipStates: Map<Trait<V>, PipState>;
}

export function cardInitialState(order: number) : CardState {
  return {
    order,
    holder: null,
    suit: null,
    rank: null,
    blank: false,
    possibleCards: new Map<string, number>(),
    identityDetermined: false,
    numPositiveClues: 0,
    turnsClued: [],
    turnDrawn: -1,
    isDiscarded: false,
    turnDiscarded: -1,
    isPlayed: false,
    turnPlayed: -1,
    isMisplayed: false,
    rankClueMemory: {
      possibilities: [],
      positiveClues: [],
      negativeClues: [],
      pipStates: new Map<number, PipState>(),
    },
    colorClueMemory: {
      possibilities: [],
      positiveClues: [],
      negativeClues: [],
      pipStates: new Map<Suit, PipState>(),
    },
  };
}
