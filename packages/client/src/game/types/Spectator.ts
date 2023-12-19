import type { PlayerIndex } from "@hanabi/game";

export interface Spectator {
  name: string;
  shadowingPlayerIndex: PlayerIndex | -1;
  shadowingPlayerName: string | undefined;
}
