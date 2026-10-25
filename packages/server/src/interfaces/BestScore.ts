export interface BestScore {
  readonly numPlayers: number;
  readonly score: number;

  /** A bitmask of the additional options that were used to make the game easier. */
  readonly modifier: number;
}
