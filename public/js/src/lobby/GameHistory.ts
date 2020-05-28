export default interface GameHistory {
  id: number;
  numPlayers: number;
  numSimilar: number;
  playerNames: string;
  score: number;
  datetimeFinished: number;
  variant: string;
  seed: string;
  incrementNumGames: boolean;
}
