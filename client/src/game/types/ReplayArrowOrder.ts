// Note that there is no corresponding server-side enum because the server does not care about which
// orders map to which UI elements; it just blindly transfers the order to the rest of the
// spectators
enum ReplayArrowOrder {
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
  CurrentEfficiency = -11,
  MinEfficiency = -12,
  FutureEfficiency = -13,
}
export default ReplayArrowOrder;
