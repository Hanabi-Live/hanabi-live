/** Corresponds to the type column in the "game_actions" table in the database. */
export enum DatabaseGameActionType {
  Play = 0,
  Discard = 1,
  ColorClue = 2,
  RankClue = 3,
  GameOver = 4,
}
