import type { Rank } from "../types/Rank.js";
import type { SuitIndex } from "../types/SuitIndex.js";

/** A card's suit and rank, as far as a player knows them. */
export interface CardIdentity {
  /** `undefined` represents an unknown suit index. */
  readonly suitIndex: SuitIndex | undefined;

  /** `undefined` represents an unknown rank. */
  readonly rank: Rank | undefined;
}
