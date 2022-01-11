import { Character } from "@hanabi/data";
import CardIdentity from "./CardIdentity";
import ClientAction from "./ClientAction";

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
