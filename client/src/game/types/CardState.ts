import Color from './Color';
import Suit from './Suit';

export default interface CardState {
  order: number;
  // The index of the player that holds this card (or null if played/discarded)
  holder: number | null;
  suit: Suit | null;
  rank: number | null;
  blank: boolean;
  // The suit corresponding to the note written on the card, if any
  noteSuit: Suit | null;
  // The rank corresponding to the note written on the card, if any
  noteRank: number | null;
  noteKnownTrash: boolean;
  noteNeedsFix: boolean;
  noteChopMoved: boolean;
  noteFinessed: boolean;
  noteBlank: boolean;
  noteUnclued: boolean;

  // The following are the variables that are refreshed
  rankClueMemory: ClueMemory<number>;
  colorClueMemory: ClueMemory<Color>;

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
  possibilities: Array<Trait<V>>,
  positiveClues: V[],
  negativeClues: V[],
  pipStates: Map<Trait<V>, PipState>,
}

export function cardInitialState(order: number) : CardState {
  return {
    order,
    holder: null,
    suit: null,
    rank: null,
    blank: false,
    noteSuit: null,
    noteRank: null,
    noteKnownTrash: false,
    noteNeedsFix: false,
    noteChopMoved: false,
    noteFinessed: false,
    noteBlank: false,
    noteUnclued: false,
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
