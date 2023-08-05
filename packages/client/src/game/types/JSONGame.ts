import type { Character } from "@hanabi/data";
import type { CardIdentity } from "./CardIdentity";
import type { ClientAction } from "./ClientAction";

export interface JSONGame {
  players: string[];
  deck: CardIdentity[];
  actions: ClientAction[];
  options: {
    variant: string;
  };
  notes: string[][];
  characters: Character[];
  id: number;
  seed: string;
}
