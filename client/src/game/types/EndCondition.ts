enum EndCondition {
  InProgress = 0,
  Normal = 1,
  Strikeout = 2,
  Timeout = 3,
  Terminated = 4,
  SpeedrunFail = 5,
  IdleTimeout = 6,
  CharacterSoftlock = 7,
}
export default EndCondition;
