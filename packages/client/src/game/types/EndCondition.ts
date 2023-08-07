/** Corresponds to values in the database. If changed, the database must also be updated. */
export enum EndCondition {
  InProgress = 0,
  Normal = 1,
  Strikeout = 2,
  Timeout = 3,
  TerminatedByPlayer = 4,
  SpeedrunFail = 5,
  IdleTimeout = 6,
  CharacterSoftlock = 7,
  AllOrNothingFail = 8,
  AllOrNothingSoftlock = 9,
  TerminatedByVote = 10,
}
