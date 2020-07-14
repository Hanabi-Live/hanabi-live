import TurnState from '../../types/TurnState';

export default function initialTurnState(startingPlayer: number = 0): TurnState {
  return {
    gameSegment: null,
    turnNum: 0,
    currentPlayerIndex: startingPlayer,
    playOrderInverted: false,
    endTurnNum: null,
    cardsPlayedOrDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
