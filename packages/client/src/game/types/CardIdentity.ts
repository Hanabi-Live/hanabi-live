import type { Rank, SuitIndex } from "@hanabi/game";

export interface CardIdentity {
  /** `null` represents an unknown suit index. */
  readonly suitIndex: SuitIndex | null;

  /** `null` represents an unknown rank. */
  readonly rank: Rank | null;
}
