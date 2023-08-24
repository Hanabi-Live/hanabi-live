import type { PlayerIndex } from "@hanabi/data";

export interface Spectator {
  name: string;
  shadowingPlayerIndex: PlayerIndex | -1;
  shadowingPlayerName: string | undefined;
}
