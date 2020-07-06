export default interface TurnState {
  readonly turn: number;
  readonly currentPlayerIndex: number;
  readonly turnsInverted: boolean;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
