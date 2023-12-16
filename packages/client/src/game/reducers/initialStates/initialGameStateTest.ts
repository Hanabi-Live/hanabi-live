import type { GameMetadata, GameState } from "@hanabi/game";
import { initialGameState } from "./initialGameState";
import { initialTurnState } from "./initialTurnState";

export function initialGameStateTest(metadata: GameMetadata): GameState {
  return {
    ...initialGameState(metadata),
    turn: {
      ...initialTurnState(),
      segment: 0,
    },
  };
}
