import type { Tuple } from "complete-common";
import type { PaceRisk } from "../enums/PaceRisk.js";
import type { CardOrder } from "../types/CardOrder.js";
import type { NumSuits } from "../types/NumSuits.js";

export interface StatsState {
  // For max score.
  readonly maxScore: number;
  readonly maxScorePerStack: Readonly<Tuple<number, NumSuits>>;

  // For pace.
  readonly pace: number | undefined;
  readonly paceRisk: PaceRisk;
  readonly finalRoundEffectivelyStarted: boolean;

  // For efficiency.
  readonly cardsGotten: number;
  readonly potentialCluesLost: number;
  // (Efficiency is simply "cardsGotten / potentialCluesLost".)

  // For future efficiency.
  readonly cluesStillUsable: number | undefined;
  readonly cluesStillUsableNotRounded: number | undefined;
  readonly cardsGottenByNotes: number | undefined;
  // - `cardsNotGotten` is simply "maxScore - cardsGotten".
  // - Future efficiency is simply "cardsNotGotten / cluesStillUsable".

  /** Store the order of the double-discard candidate card, or undefined if not in DDA. */
  readonly doubleDiscardCard: CardOrder | undefined;

  // For determining sound effects.
  readonly numSubsequentBlindPlays: number;
  readonly numSubsequentMisplays: number;

  /** For "Throw It in a Hole" variants. */
  readonly numAttemptedCardsPlayed: number;
}
