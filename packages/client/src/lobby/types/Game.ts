import type { NumPlayers, Options } from "@hanabi-live/game";

export interface Game {
  tableID: number;
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
  variant: VariantStats;
}

interface VariantStats {
  numGames: number;
  bestScores: BestScore[];
}

interface BestScore {
  numPlayers: NumPlayers;
  score: number;
  modifier: number;
}
