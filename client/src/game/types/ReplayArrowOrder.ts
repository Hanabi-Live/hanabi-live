// Note that there is no corresponding server-side enum because the server does not care about which
// orders map to which UI elements; it just blindly transfers the order to the rest of the
// spectators
enum ReplayArrowOrder {
  Deck = -1,
  Turn = -2,
  Score = -3,
  MaxScore = -4,
  Clues = -5,
  Strike1 = -6,
  Strike2 = -7,
  Strike3 = -8,
  Pace = -9,
  Efficiency = -10,
  MinEfficiency = -11,
}
export default ReplayArrowOrder;
