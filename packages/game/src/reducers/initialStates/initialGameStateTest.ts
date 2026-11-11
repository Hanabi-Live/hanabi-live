import type { GameMetadata } from "../../interfaces/GameMetadata.js";
import type { GameState } from "../../interfaces/GameState.js";
import { getInitialGameState } from "./initialGameState.js";
import { getInitialTurnState } from "./initialTurnState.js";

export function getInitialGameStateTest(metadata: GameMetadata): GameState {
  return {
    ...getInitialGameState(metadata),
    turn: {
      ...getInitialTurnState(),
      segment: 0,
    },
  };
}
