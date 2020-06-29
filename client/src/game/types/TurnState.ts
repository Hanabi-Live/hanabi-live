export default interface TurnState {
  readonly turn: number;
  readonly currentPlayerIndex: number;
  readonly cardsPlayedOrDiscardedThisTurn: number;
}
