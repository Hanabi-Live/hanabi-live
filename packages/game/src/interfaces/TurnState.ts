import type { PlayerIndex } from "../types/PlayerIndex";

export interface TurnState {
  /**
   * "segment" mostly corresponds to the turn, with some exceptions:
   * 1) Some Detrimental Characters can take two actions, and each action should be on a separate
   *    replay segment.
   * 2) The server sends the total amount of time that each player took at the end of the game; this
   *    should exist on a separate replay segment to avoid cluttering the final action of the game.
   *
   * The client makes a copy of the entire game state whenever "segment" changes.
   *
   * This is null when dealing the initial cards, then set to 0.
   */
  readonly segment: number | null;

  readonly turnNum: number;

  /**
   * Initialized to the starting player index. If this is null, it signifies that the game is over
   * and will prevent any name frames from being highlighted on subsequent segments.
   */
  readonly currentPlayerIndex: PlayerIndex | null;

  readonly playOrderInverted: boolean;
  readonly endTurnNum: number | null;
  readonly cardsPlayedOrDiscardedThisTurn: number;
  readonly cardsDiscardedThisTurn: number;
  readonly cluesGivenThisTurn: number;
}
