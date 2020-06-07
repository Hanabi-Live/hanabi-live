// Imports
import Options from '../game/types/Options';

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
  numGamesOnThisSeed: number;
  playerNames: string[];
  incrementNumGames: boolean;
}
