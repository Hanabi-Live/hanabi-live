import type { PlayerIndex, TurnState } from "@hanabi/game";

export function initialTurnState(
  startingPlayerIndex: PlayerIndex = 0,
): TurnState {
  return {
    segment: null,
    turnNum: 0,
    currentPlayerIndex: startingPlayerIndex,
    playOrderInverted: false,
    endTurnNum: null,
    cardsPlayedOrDiscardedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
