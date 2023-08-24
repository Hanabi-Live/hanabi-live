import type { PlayerIndex } from "@hanabi/data";
import type { CardIdentity } from "./CardIdentity";
import type { GameState } from "./GameState";

export interface HypotheticalState {
  readonly ongoing: GameState;

  /**
   * This will have 1 element if we have entered a hypothetical but not made any moves yet, 2
   * elements if we have made 1 move, etc.
   */
  readonly states: readonly GameState[];

  readonly showDrawnCards: boolean;
  readonly drawnCardsInHypothetical: readonly number[];

  /**
   * A sparse array indexed by card order.
   *
   * If a card is in this array, it is being shown with an alternate identity. If the alternate
   * identity is null/null, it is shown as blank.
   */
  readonly morphedIdentities: readonly CardIdentity[];

  readonly startingPlayerIndex: PlayerIndex | null;
}
