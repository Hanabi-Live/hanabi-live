import Color from "./Color";

export default interface CardState {
  readonly order: number;
  // If location is a number, it is the index of the player that holds this card
  readonly location: CardLocation;
  readonly suitIndex: number | null;
  readonly rank: number | null;

  // possibleCardsFromClues is a one-dimensional array of tuples
  // It contains a tuple for each specific card that is still possible based on the clues touching
  // the card so far
  // Do not access this by the index; filter the array to find the remaining cards that you need
  readonly possibleCardsFromClues: ReadonlyArray<readonly [number, number]>;

  // possibleCards is a one-dimensional array of tuples
  // It contains a tuple for each specific card that is still possible
  // based on everything we know so far
  // Do not access this by the index; filter the array to find the remaining cards that you need
  readonly possibleCards: ReadonlyArray<readonly [number, number]>;

  // possibleCardsForEmpathy is a one-dimensional array of tuples
  // It contains a tuple for each specific card that is still possible based on everything the
  // player holding it should know so far
  // Do not access this by the index; filter the array to find the remaining cards that you need
  readonly possibleCardsForEmpathy: ReadonlyArray<readonly [number, number]>;

  // An array that specifies whether the card is revealed to a particular player index
  readonly revealedToPlayer: readonly boolean[];

  // We need this to highlight pips (e.g. on Pink variants)
  readonly positiveColorClues: Color[]; // The elements of this array will always be unique
  readonly positiveRankClues: number[]; // The elements of this array will always be unique

  // TODO: save positive rank clues and highlight them (e.g. on Rainbow-Ones variants)

  readonly suitDetermined: boolean;
  readonly rankDetermined: boolean;
  readonly hasClueApplied: boolean;
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
