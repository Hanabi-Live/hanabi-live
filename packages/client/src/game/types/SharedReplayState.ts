export interface SharedReplayState {
  readonly segment: number;
  readonly useSharedSegments: boolean;
  readonly leader: string;
  readonly amLeader: boolean;

  /** When the shared replay began. We do not use a `Date` object to speed up state copying. */
  readonly datetimeStarted: string;

  /**
   * Hides what happens later in the game: the turn slider, jumping to the end, and future strikes.
   */
  readonly spoilerFree: boolean;

  /** The players who will not play again if the leader restarts. */
  readonly restartDeclined: readonly string[];
}
