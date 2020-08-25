import { GameAction } from './actions';
import { PaceRisk } from './GameState';
import SoundType from './SoundType';

export default interface StatsState {
  readonly maxScore: number;
  readonly doubleDiscard: boolean;
  readonly potentialCluesLost: number;
  readonly efficiency: number;
  readonly pace: number | null;
  readonly paceRisk: PaceRisk;
  readonly lastAction: GameAction | null;
  readonly soundTypeForLastAction: SoundType;
}
