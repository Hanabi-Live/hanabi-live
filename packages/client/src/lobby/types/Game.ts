import type { Options } from "../../types/Options";

export interface Game {
  name: string;
  owner: number;
  players: Player[];
  options: Options;
  passwordProtected: boolean;
  maxPlayers: number;
}

interface Player {
  index: number;
  name: string;
  you: boolean;
  present: boolean;
  stats: Stats;
}

interface Stats {
  numGames: number;
  variant: StatsVariant;
}

interface StatsVariant {
  numGames: number;
  bestScores: BestScore[];
  averageScore: number;
  numStrikeouts: number;
}

interface BestScore {
  numPlayers: number;
  score: number;
  modifier: number;
}
