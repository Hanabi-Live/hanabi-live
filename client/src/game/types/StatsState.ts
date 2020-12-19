import { GameAction } from "./actions";
import { PaceRisk } from "./GameState";
import SoundType from "./SoundType";

export default interface StatsState {
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
  // (efficiency is simply "cardsGotten / potentialCluesLost")

  // For future efficiency
  readonly cluesStillUsable: number | null;
  readonly cardsGottenByNotes: number | null;
  // (cardsNotGotten is simply "maxScore - cardsGotten")
  // (future efficiency is simply "cardsNotGotten / cluesStillUsable")

  // Other
  readonly doubleDiscard: boolean;
  readonly lastAction: GameAction | null; // Used for determining sound effects
  readonly soundTypeForLastAction: SoundType;
}
