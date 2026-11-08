import type { TurnState } from "../../interfaces/TurnState";

export function getInitialTurnState(): TurnState {
  return {
    segment: null, // eslint-disable-line unicorn/no-null
    turnNum: 0,
    currentPlayerIndex: 0,
    playOrderInverted: false,
    endTurnNum: null, // eslint-disable-line unicorn/no-null
    cardsPlayedOrDiscardedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
