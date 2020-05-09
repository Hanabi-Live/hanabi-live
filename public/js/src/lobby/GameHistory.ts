export default interface GameHistory {
  id: number;
  numPlayers: number;
  numSimilar: number;
  playerNames: string;
  score: number;
  datetime: number;
  variant: string;
  seed: string;
  incrementNumGames: boolean;
}
