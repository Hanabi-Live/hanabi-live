import type { Options } from "@hanabi/game";

export interface GameHistory {
  id: number;
  options: Options;
  seed: string;
  score: number;
  numTurns: number;
  endCondition: number;
  datetimeStarted: string;
  datetimeFinished: string;
  numGamesOnThisSeed: number;
  playerNames: string[];
  incrementNumGames: boolean;
}
