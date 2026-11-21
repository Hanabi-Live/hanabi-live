import type { TurnState } from "../../interfaces/TurnState.ts";

export function getInitialTurnState(): TurnState {
  return {
    segment: undefined,
    turnNum: 0,
    currentPlayerIndex: 0,
    endTurnNum: undefined,
    cardsPlayedOrDiscardedThisTurn: 0,
  };
}
