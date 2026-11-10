import type { TurnState } from "../../interfaces/TurnState";

export function getInitialTurnState(): TurnState {
  return {
    segment: undefined,
    turnNum: 0,
    currentPlayerIndex: 0,
    playOrderInverted: false,
    endTurnNum: undefined,
    cardsPlayedOrDiscardedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
