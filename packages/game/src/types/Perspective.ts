/**
 * Where a client sees a game from, which decides what the game state shows.
 *
 * - `seat`: a player, or a spectator who shadows one, in an ongoing game. Throw It in a Hole hides
 *   the cards that they play.
 * - `spectator`: a spectator who shadows nobody, or anyone in a replay. They see every card.
 * - `hypothetical`: a line of play in a replay. They see every card, and the log marks each move.
 */
export type Perspective = "seat" | "spectator" | "hypothetical";
