import Color from "./Color";

export default interface CardState {
  readonly order: number;
  // If location is a number, it is the index of the player that holds this card
  readonly location: CardLocation;
  readonly suitIndex: number | null;
  readonly rank: number | null;

  // possibleCardsFromObservation is a two-dimensional array indexed by suitIndex and rank
  // The value is how many cards of this suitIndex and rank it could be (excluding clue information)
  // Note that we are using an array as a map,
  // so there will be empty spaces for ranks that are not valid card ranks
  // (e.g. 0, or 6 in Up or Down)
  readonly possibleCardsFromObservation: ReadonlyArray<readonly number[]>;

  // possibleCardsFromClues is a one-dimensional array of tuples
  // It contains a tuple for each specific card that is still possible based on the clues touching
  // the card so far
  // Do not access this by the index; filter the array to find the remaining cards that you need
  // This is not a two-dimensional array like "possibleCardsFromObservation" is because clues remove
  // card possibilities in a binary way (as opposed to removing them one by one)
  readonly possibleCardsFromClues: ReadonlyArray<readonly [number, number]>;

  // We need this to highlight pips (e.g. on Pink variants)
  readonly positiveColorClues: Color[]; // The elements of this array will always be unique
  readonly positiveRankClues: number[]; // The elements of this array will always be unique

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

  // Needed for special sound effects
  readonly dealtToStartingHand: boolean;
  readonly firstCluedWhileOnChop: boolean | null;
}

export type CardLocation = "deck" | "discard" | "playStack" | number;
