import type { Character } from "@hanabi/data";
import type { CardIdentity } from "@hanabi/game";
import type { ClientAction } from "./ClientAction";

export interface JSONGame {
  players: string[];
  deck: CardIdentity[];
  actions: readonly ClientAction[];
  options: {
    variant: string;
  };
  notes: string[][];
  characters: Character[];
  id: number;
  seed: string;
}
