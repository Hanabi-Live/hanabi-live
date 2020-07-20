import Options from './Options';

export default class LegacyGameMetadata {
  // Game settings
  tableID: number = 0; // Equal to the table ID on the server
  playerNames: string[] = [];
  ourPlayerIndex: number = 0; // 0 if a spectator or a replay of a game that we were not in
  spectating: boolean = false;
  replay: boolean = false;
  sharedReplay: boolean = false;
  databaseID: number = 0; // 0 if this is an ongoing game
  seed: string = '';
  seeded: boolean = false; // If playing a table started with the "!seed" prefix
  datetimeStarted: Date = new Date();
  datetimeFinished: Date = new Date();
  options: Options = new Options();

  // Character settings
  characterAssignments: Array<number | null> = [];
  characterMetadata: number[] = [];

  // Hypothetical settings
  hypothetical: boolean = false;
  hypoActions: string[] = [];
  hypoRevealed: boolean = false;

  // Other features
  paused: boolean = false;
  pausePlayer: string = '';
  pauseQueued: boolean = false;
}
