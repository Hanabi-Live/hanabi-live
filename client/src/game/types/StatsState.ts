import { PaceRisk } from './GameState';

export default interface StatsState {
  readonly cardsGotten: number;
  readonly potentialCluesLost: number;
  readonly efficiency: number;
  readonly pace: number | null;
  readonly paceRisk: PaceRisk;
}
