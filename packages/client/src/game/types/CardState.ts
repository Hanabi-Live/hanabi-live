import type {
  Color,
  Rank,
  RankClueNumber,
  SuitIndex,
  SuitRankTuple,
} from "@hanabi/data";

export interface CardState {
  readonly order: number;

  /** If this is a number, it is the index of the player that holds this card. */
  readonly location: "deck" | "discard" | "playStack" | number;

  readonly suitIndex: SuitIndex | null;
  readonly rank: Rank | null;

  /**
   * A one-dimensional array of tuples. It contains a tuple for each specific card that is still
   * possible based on the clues touching the card so far. Do not access this by the index; filter
   * the array to find the remaining cards that you need.
   */
  readonly possibleCardsFromClues: readonly SuitRankTuple[];

  /**
   * A one-dimensional array of tuples. It contains a tuple for each specific card that is still
   * possible based on everything we know so far. Do not access this by the index; filter the array
   * to find the remaining cards that you need.
   */
  readonly possibleCards: readonly SuitRankTuple[];

  /**
   * A one-dimensional array of tuples. It contains a tuple for each specific card that is still
   * possible based on everything the player holding it should know so far. Do not access this by
   * the index; filter the array to find the remaining cards that you need.
   */
  readonly possibleCardsForEmpathy: readonly SuitRankTuple[];

  /** An array that specifies whether the card is revealed to a particular player index. */
  readonly revealedToPlayer: readonly boolean[];

  /**
   * We need this to highlight pips (e.g. in pink variants).
   *
   * The elements of this array will always be unique.
   */
  readonly positiveColorClues: Color[];

  /**
   * We need this to highlight pips (e.g. in pink variants).
   *
   * The elements of this array will always be unique.
   */
  readonly positiveRankClues: RankClueNumber[];

  readonly suitDetermined: boolean;
  readonly rankDetermined: boolean;
  readonly hasClueApplied: boolean;
  readonly numPositiveClues: number;
  readonly segmentFirstClued: number | null;
  readonly segmentDrawn: number | null;
  readonly segmentDiscarded: number | null;
  readonly segmentPlayed: number | null;

  /**
   * Whether the card is potentially in DDA. Since DDA status depends on the card's location and
   * empathy rather than just the identity of the card, it is tracked as a sub-property of
   * `CardState`, not `CardStatus`.
   */
  readonly inDoubleDiscard: boolean;

  /** Track whether the card is known-trash from empathy alone. */
  readonly isKnownTrashFromEmpathy: boolean;

  /** Needed so that we can animate a misplayed card different from a discarded card. */
  readonly isMisplayed: boolean;

  /** Needed for special sound effects. */
  readonly dealtToStartingHand: boolean;

  /** Needed for special sound effects. */
  readonly firstCluedWhileOnChop: boolean | null;
}
