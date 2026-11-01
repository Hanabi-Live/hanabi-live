import type { BestScore } from "./BestScore";

/** These are the stats for a user playing a specific variant. */
export interface UserStatsRow {
  readonly numGames: number;

  /** Indexed by the number of players minus 2. (From 2-player to 6-player.) */
  readonly bestScores: readonly BestScore[];
  readonly averageScore: number;
  readonly numStrikeouts: number;
}
