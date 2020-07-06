export default interface TurnState {
  readonly turn: number;
  readonly currentPlayerIndex: number | null;
  readonly turnsInverted: boolean;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
