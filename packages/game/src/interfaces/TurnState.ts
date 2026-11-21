import type { PlayerIndex } from "../types/PlayerIndex.ts";

export interface TurnState {
  /**
   * "segment" mostly corresponds to the turn. The exception is the total amount of time that each
   * player took, which the server sends at the end of the game. It is on a separate replay segment
   * to avoid cluttering the final action of the game.
   *
   * The client makes a copy of the entire game state whenever "segment" changes.
   *
   * This is undefined when dealing the initial cards, then set to 0.
   */
  readonly segment: number | undefined;

  readonly turnNum: number;

  /**
   * Initialized to the first seat. If this is undefined, it signifies that the game is over and
   * will prevent any name frames from being highlighted on subsequent segments.
   */
  readonly currentPlayerIndex: PlayerIndex | undefined;

  readonly endTurnNum: number | undefined;
  readonly cardsPlayedOrDiscardedThisTurn: number;
}
