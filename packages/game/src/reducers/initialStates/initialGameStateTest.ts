import type { GameMetadata } from "../../interfaces/GameMetadata.ts";
import type { GameState } from "../../interfaces/GameState.ts";
import { getInitialGameState } from "./initialGameState.ts";
import { getInitialTurnState } from "./initialTurnState.ts";

export function getInitialGameStateTest(metadata: GameMetadata): GameState {
  return {
    ...getInitialGameState(metadata),
    turn: {
      ...getInitialTurnState(),
      segment: 0,
    },
  };
}
