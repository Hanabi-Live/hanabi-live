export default interface TurnState {
  // "segment" mostly corresponds to the turn, with some exceptions:
  // 1) Some Detrimental Characters can take two actions, and each action should be on a separate
  //    replay segment
  // 2) The server sends the total amount of time that each player took at the end of the game;
  //    this should exist on a separate replay segment to avoid cluttering the final action of the
  //    game
  // The client makes a copy of the entire game state whenever "segment" changes
  readonly segment: number | null; // Null when dealing the initial cards, then set to 0
  readonly turnNum: number;
  readonly currentPlayerIndex: number | null;
  readonly playOrderInverted: boolean;
  readonly endTurnNum: number | null;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
