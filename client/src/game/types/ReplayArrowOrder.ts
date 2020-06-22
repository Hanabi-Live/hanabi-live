// Note that there is no corresponding server-side enum because the server does not care about which
// orders map to which UI elements; it just blindly transfers the order to the rest of the
// spectators
enum ReplayArrowOrder {
  Deck = -1,
  Turn = -2,
  Score = -3,
  MaxScore = -4,
  Clues = -5,
  Pace = -6,
  Efficiency = -7,
  MinEfficiency = -8,
}

export default ReplayArrowOrder;
