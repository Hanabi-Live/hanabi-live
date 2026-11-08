/** The parts of the board that a shared-replay arrow can point at, besides cards. */
export enum ReplayArrowOrder {
  Nothing = -1,
  Deck = -2,
  Turn = -3,
  Score = -4,
  MaxScore = -5,
  Clues = -6,
  Strike1 = -7,
  Strike2 = -8,
  Strike3 = -9,
  Pace = -10,
  Efficiency = -11,
  MinEfficiency = -12,
}
