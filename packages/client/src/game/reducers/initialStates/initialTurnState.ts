import { TurnState } from "../../types/TurnState";

export function initialTurnState(startingPlayer = 0): TurnState {
  return {
    segment: null,
    turnNum: 0,
    currentPlayerIndex: startingPlayer,
    playOrderInverted: false,
    endTurnNum: null,
    cardsPlayedOrDiscardedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
