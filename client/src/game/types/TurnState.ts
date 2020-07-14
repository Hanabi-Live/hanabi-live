export default interface TurnState {
  // "gameSegment" mostly corresponds to the turn, with some exceptions:
  // 1) Some Detrimental Characters can take two actions, and each action should be on a separate
  //    replay segment
  // 2) The server sends the total amount of time that each player took at the end of the game;
  //    this should exist on a separate replay segment to avoid cluttering the final action of the
  //    game
  // The client makes a copy of the entire game state whenever "gameSegment" changes
  readonly gameSegment: number | null; // Null when dealing the initial cards, then set to 0
  readonly turnNum: number; // Null when dealing the initial cards, then set to 0
  readonly currentPlayerIndex: number | null;
  readonly playOrderInverted: boolean;
  readonly endTurnNum: number | null;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
