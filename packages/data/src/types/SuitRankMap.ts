import type { Rank } from "./Rank";
import type { SuitIndex } from "./SuitIndex";

/**
 * A two-dimensional map indexed by suit index and then by rank.
 *
 * We do not want to use a `Map` since that cannot be natively used by Immer and may be slow to
 * copy. Thus, we instead use a two-dimensional `Record` (which is just a normal JavaScript object
 * at run-time).
 */
export type SuitRankMap<T> = Record<SuitIndex, Record<Rank, T>>;
