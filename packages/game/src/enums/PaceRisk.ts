/** A measure of how risky a discard would be right now, using different heuristics. */
export enum PaceRisk {
  /** The default state during the early game and mid-game. */
  Low,

  /**
   * Formula derived by Hyphen-ated; a conservative estimate of "End-Game" that does not account for
   * the number of players.
   */
  Medium,

  /**
   * Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
   * number of players.
   */
  High,

  /**
   * Represents the current pace having a value of 0, meaning that no more discards can occur in
   * order to get a maximum score.
   */
  Zero,
}
