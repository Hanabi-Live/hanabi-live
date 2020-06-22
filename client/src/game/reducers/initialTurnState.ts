import TurnState from '../types/TurnState';

export default function initialTurnState(): TurnState {
  return {
    turn: 0,
    currentPlayerIndex: 0,
  };
}
