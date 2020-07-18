enum EndCondition {
  InProgress,
  Normal,
  Strikeout,
  Timeout,
  Terminated,
  SpeedrunFail,
  IdleTimeout,
  CharacterSoftlock,
  AllOrNothingFail,
  AllOrNothingSoftlock,
}
export default EndCondition;
