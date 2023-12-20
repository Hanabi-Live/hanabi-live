import type { GameMetadata } from "../../interfaces/GameMetadata";
import type { GameState } from "../../interfaces/GameState";
import { getInitialGameState } from "./initialGameState";
import { getInitialTurnState } from "./initialTurnState";

export function getInitialGameStateTest(metadata: GameMetadata): GameState {
  return {
    ...getInitialGameState(metadata),
    turn: {
      ...getInitialTurnState(),
      segment: 0,
    },
  };
}
