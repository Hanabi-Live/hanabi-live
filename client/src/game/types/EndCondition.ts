enum EndCondition {
  InProgress,
  Normal,
  Strikeout,
  Timeout,
  Terminated,
  VotedToKill,
  SpeedrunFail,
  IdleTimeout,
  CharacterSoftlock,
  AllOrNothingFail,
  AllOrNothingSoftlock,
}
export default EndCondition;
