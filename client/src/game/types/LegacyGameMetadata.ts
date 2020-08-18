import Options from '../../types/Options';

export default interface LegacyGameMetadata {
  // Game settings
  tableID: number; // Equal to the table ID on the server
  playerNames: string[];
  ourPlayerIndex: number; // 0 if a spectator or a replay of a game that we were not in
  spectating: boolean;
  replay: boolean;
  databaseID: number; // 0 if this is an ongoing game
  hasCustomSeed: boolean; // If playing a table started with the "!seed" prefix
  seed: string;
  datetimeStarted: string;
  datetimeFinished: string;
  options: Options;

  // Character settings
  // "characterAssignments" comes from the server as only numbers,
  // but we want to convert -1 to null in place
  characterAssignments: Array<number | null>;
  characterMetadata: number[];

  // Shared replay settings
  sharedReplay: boolean;
  sharedReplayLeader: string;
  sharedReplaySegment: number;

  // Pause settings
  paused: boolean;
  pausePlayerIndex: number;
  pauseQueued: boolean;
}
