import type { TurnState } from "../../interfaces/TurnState";
import type { PlayerIndex } from "../../types/PlayerIndex";

export function getInitialTurnState(
  startingPlayerIndex: PlayerIndex = 0,
): TurnState {
  return {
    segment: null, // eslint-disable-line unicorn/no-null
    turnNum: 0,
    currentPlayerIndex: startingPlayerIndex,
    playOrderInverted: false,
    endTurnNum: null, // eslint-disable-line unicorn/no-null
    cardsPlayedOrDiscardedThisTurn: 0,
    cardsDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
