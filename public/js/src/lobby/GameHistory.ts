export default interface GameHistory {
  id: number;
  numPlayers: number;
  variant: string;
  timed: boolean;
  timeBase: number;
  timePerTurn: number;
  speedrun: boolean;
  cardCycle: boolean;
  deckPlays: boolean;
  emptyClues: boolean;
  characterAssignments: boolean;
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
