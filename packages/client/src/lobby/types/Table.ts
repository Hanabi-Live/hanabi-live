import type { NumPlayers } from "@hanabi/data";
import type { Options } from "@hanabi/game";
import type { Spectator } from "../../game/types/Spectator";

export interface Table {
  id: number;
  name: string;
  passwordProtected: boolean;
  joined: boolean;
  numPlayers: NumPlayers;
  owned: boolean;
  options: Options;
  running: boolean;
  variant: string; // e.g. "No Variant"
  timed: boolean;
  timeBase: number;
  timePerTurn: number;
  ourTurn: boolean;
  sharedReplay: boolean;
  progress: number;
  players: string[]; // e.g. ['Alice', 'Bob']
  spectators: Spectator[];
  maxPlayers: number;
}
