import type { GameAction } from "./actions";
import type { PaceRisk } from "./GameState";
import type { SoundType } from "./SoundType";

export interface StatsState {
  // For max score
  readonly maxScore: number;
  readonly maxScorePerStack: number[];

  // For pace
  readonly pace: number | null;
  readonly paceRisk: PaceRisk;
  readonly finalRoundEffectivelyStarted: boolean;

  // For efficiency
  readonly cardsGotten: number;
  readonly potentialCluesLost: number;
  // (Efficiency is simply "cardsGotten / potentialCluesLost".)

  // For future efficiency
  readonly cluesStillUsable: number | null;
  readonly cluesStillUsableNotRounded: number | null;
  readonly cardsGottenByNotes: number | null;
  // - `cardsNotGotten` is simply "maxScore - cardsGotten".
  // - Future efficiency is simply "cardsNotGotten / cluesStillUsable".

  // Other. Store the order of the double-discard candidate, or null if not in DDA.
  readonly doubleDiscard: number | null;
  readonly lastAction: GameAction | null; // Used for determining sound effects
  readonly soundTypeForLastAction: SoundType;
}
