export default interface Game {
  name: string;
  owner: number;
  players: Array<Player>;
  variant: string;
  timed: boolean;
  baseTime: number;
  timePerTurn: number;
  speedrun: boolean;
  cardCycle: boolean;
  deckPlays: boolean;
  emptyClues: boolean;
  characterAssignments: boolean;
  password: boolean;
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
  bestScores: Array<BestScore>;
  averageScore: number;
  numStrikeouts: number;
}

interface BestScore {
  numPlayers: number;
  score: number;
  modifier: number;
}
