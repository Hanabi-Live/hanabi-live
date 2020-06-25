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

  // possibleCards[suitIndex][rank] = how many cards of this suitIndex and rank could this be?
  // NOTE: we're using an array as a map, so there will be empty spaces for ranks
  // that are not valid card ranks (e.g. 0, or 6 in Up or Down)
  possibleCards: number[][];
  identityDetermined: boolean;
  numPositiveClues: number;
  turnsClued: number[]; // TODO: seems like the UI only cares about the 1st turn clued?
  turnDrawn: number;
  isDiscarded: boolean;
  turnDiscarded: number;
  isPlayed: boolean;
  turnPlayed: number;
  isMisplayed: boolean;
}

export type PipState = 'Visible' | 'Eliminated' | 'Hidden' | 'PositiveClue';

export interface ClueMemory {
  // NOTE: we're using arrays as maps, so there will be empty spaces for ranks
  // that are not valid card ranks (e.g. 0, or 6 in Up or Down)
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
