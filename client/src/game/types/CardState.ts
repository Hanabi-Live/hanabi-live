export default interface CardState {
  readonly order: number;
  // If location is a number, it is the index of the player that holds this card
  readonly location: CardLocation;
  readonly suitIndex: number | null;
  readonly rank: number | null;

  // The following are the variables that are refreshed

  // possibleCardsFromObservation[suitIndex][rank]
  //  = how many cards of this suitIndex and rank could this be? (excluding clue information)
  // NOTE: we're using an array as a map, so there will be empty spaces for ranks
  // that are not valid card ranks (e.g. 0, or 6 in Up or Down)
  readonly possibleCardsFromObservation: ReadonlyArray<readonly number[]>;
  readonly possibleCardsFromClues: ReadonlyArray<readonly [number, number]>;

  // we need this to highlight pips on pink cards
  readonly positiveRankClues : number[];

  readonly suitDetermined: boolean;
  readonly rankDetermined: boolean;
  readonly numPositiveClues: number;
  readonly segmentFirstClued: number | null;
  readonly segmentDrawn: number | null;
  readonly segmentDiscarded: number | null;
  readonly segmentPlayed: number | null;

  // Needed so that we can animate a misplayed card different from a discarded card
  readonly isMisplayed: boolean;
}

export type CardLocation = 'deck' | 'discard' | 'playStack' | number;
