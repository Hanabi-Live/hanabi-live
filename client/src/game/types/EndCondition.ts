enum EndCondition {
  InProgress = 0,
  Normal = 1,
  Strikeout = 2,
  Timeout = 3,
  Terminated = 4,
  SpeedrunFail = 5,
  IdleTimeout = 6,
  CharacterSoftlock = 7,
  AllOrNothingFail = 8,
  AllOrNothingSoftlock = 9,
}
export default EndCondition;
