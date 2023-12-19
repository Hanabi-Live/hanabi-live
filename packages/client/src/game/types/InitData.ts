import type { NumPlayers, Options, PlayerIndex } from "@hanabi/game";
import type { Tuple } from "isaacscript-common-ts";

export interface InitData {
  // Game settings
  readonly tableID: number; // Equal to the table ID on the server.
  readonly playerNames: Readonly<Tuple<string, NumPlayers>>;
  readonly ourPlayerIndex: PlayerIndex; // 0 if a spectator or a replay of a game that we were not in.
  readonly spectating: boolean;
  readonly shadowing: boolean;
  readonly replay: boolean;
  readonly databaseID: number; // 0 if this is an ongoing game.
  readonly hasCustomSeed: boolean; // If playing a table started with the "!seed" prefix.
  readonly seed: string;
  readonly datetimeStarted: string;
  readonly datetimeFinished: string;
  readonly options: Options;

  // Character settings
  /** Comes from the server as only numbers, but we want to convert -1 to null in place. */
  readonly characterAssignments: Readonly<Tuple<number | null, NumPlayers>>;
  readonly characterMetadata: Readonly<Tuple<number, NumPlayers>>;

  // Shared replay settings
  readonly sharedReplay: boolean;
  readonly sharedReplayLeader: string;
  readonly sharedReplaySegment: number;
  readonly sharedReplayEffMod: number;

  // Pause settings
  readonly paused: boolean;
  readonly pausePlayerIndex: PlayerIndex;
  readonly pauseQueued: boolean;
}
