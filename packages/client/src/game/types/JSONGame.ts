import type { CardIdentity, Character } from "@hanabi/game";
import type { ClientAction } from "./ClientAction";

/**
 * Represents the state of a game in a minimal, serializable format. This JSON stringified object is
 * put into the clipboard when players perform the "/copy" command.
 */
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
