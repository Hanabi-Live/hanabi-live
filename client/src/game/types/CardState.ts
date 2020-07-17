export default interface CardState {
  readonly order: number;
  // If location is a number, it is the index of the player that holds this card
  readonly location: CardLocation;
  readonly suitIndex: number | null;
  readonly rank: number | null;

  // The following are the variables that are refreshed
  readonly rankClueMemory: ClueMemory;
  readonly colorClueMemory: ClueMemory;

  // possibleCards[suitIndex][rank] = how many cards of this suitIndex and rank could this be?
  // Note that we are using an array as a map, so there will be empty spaces for ranks that are not
  // valid card ranks (e.g. 0, or 6 in Up or Down)
  readonly possibleCards: ReadonlyArray<readonly number[]>;
  readonly identityDetermined: boolean;
  readonly numPositiveClues: number;
  readonly segmentFirstClued: number | null;
  readonly segmentDrawn: number | null;
  readonly segmentDiscarded: number | null;
  readonly segmentPlayed: number | null;

  // Needed so that we can animate a misplayed card different from a discarded card
  readonly isMisplayed: boolean;
}

export type CardLocation = 'deck' | 'discard' | 'playStack' | number;
export type PipState = 'Visible' | 'Hidden' | 'Eliminated';

export interface ClueMemory {
  // NOTE: we're using arrays as maps, so there will be empty spaces for ranks
  // that are not valid card ranks (e.g. 0, or 6 in Up or Down)
  readonly possibilities: readonly number[];
  // TODO: positiveClues and negativeClues should be used like maps
  // of booleans so you can quickly check if a particular color/rank
  // has a positive/negative clue without searching the array.
  // But to make this change safely, the applyClue function
  // has to be thoroughly covered by tests.
  readonly positiveClues: readonly number[];
  readonly negativeClues: readonly number[];
  // TODO: pipStates is not really necessary to be stored in state
  // since it can be calculated from possibilities + possibleCards every time
  readonly pipStates: readonly PipState[];
}
