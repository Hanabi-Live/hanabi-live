export interface SharedReplayState {
  readonly segment: number;
  readonly useSharedSegments: boolean;
  readonly leader: string;
  readonly amLeader: boolean;

  /**
   * Hides what happens later in the game: the turn slider, jumping to the end, and future strikes.
   */
  readonly spoilerFree: boolean;
}
