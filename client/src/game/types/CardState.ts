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

  // possibleCardsFromClues = Array<[suitIndex, rank]>
  //  = which specific cards are still possible based on clues received
  readonly possibleCardsFromClues: ReadonlyArray<readonly [number, number]>;

  // We need this to highlight pips (e.g. on Pink variants)
  readonly positiveRankClues : number[];

  // TODO: save positive rank clues and highlight them (e.g. on Rainbow-Ones variants)

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
