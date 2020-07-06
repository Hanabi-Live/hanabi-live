import TurnState from '../../types/TurnState';

export default function initialTurnState(startingPlayer: number = 0): TurnState {
  return {
    turn: 0,
    currentPlayerIndex: startingPlayer,
    turnsInverted: false,
    cardsPlayedOrDiscardedThisTurn: 0,
    cluesGivenThisTurn: 0,
  };
}
