// Imports
import Options from '../game/Options';

export default interface GameHistory {
  id: number;
  numPlayers: number;
  options: Options;
  seed: string;
  score: number;
  numTurns: number;
  endCondition: number;
  datetimeStarted: Date;
  datetimeFinished: Date;
  numSimilar: number;
  playerNames: string;
  incrementNumGames: boolean;
}
