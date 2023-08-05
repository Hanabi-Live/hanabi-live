import type { GameMetadata } from "../../types/GameMetadata";
import type { GameState } from "../../types/GameState";
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
