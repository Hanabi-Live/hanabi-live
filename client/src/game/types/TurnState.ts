export default interface TurnState {
  readonly turnNum: number;
  readonly currentPlayerIndex: number | null;
  readonly playOrderInverted: boolean;
  readonly endTurnNum: number | null;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
