// Miscellaneous helpers used by several reducers.

import type { GameState } from "../interfaces/GameState.ts";
import { getEfficiency } from "../rules/stats.ts";

export function getEfficiencyFromGameState(
  gameState: GameState,
): number | undefined {
  return getEfficiency(
    gameState.stats.cardsGotten,
    gameState.stats.potentialCluesLost,
  );
}
