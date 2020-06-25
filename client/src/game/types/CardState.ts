export default interface CardState {
  readonly order: number;
  // The index of the player that holds this card (or null if played/discarded)
  holder: number | null;
  suitIndex: number | null;
  rank: number | null;
  blank: boolean;

  // The following are the variables that are refreshed
  readonly rankClueMemory: ClueMemory;
  readonly colorClueMemory: ClueMemory;

  possibleCards: number[][]; // indexed possibleCards[suitIndex][rank]
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

export interface ClueMemory {
  possibilities: number[];
  positiveClues: number[];
  negativeClues: number[];
  pipStates: PipState[];
}

export function cardInitialState(order: number) : CardState {
  return {
    order,
    holder: null,
    suitIndex: null,
    rank: null,
    blank: false,
    possibleCards: [],
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
      pipStates: [],
    },
    colorClueMemory: {
      possibilities: [],
      positiveClues: [],
      negativeClues: [],
      pipStates: [],
    },
  };
}
