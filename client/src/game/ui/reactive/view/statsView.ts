import { PaceRisk } from '../../../types/GameState';

export function onEfficiencyChanged(efficiency: number) {
  console.log(`efficiency: ${efficiency}`);
}

export function onPaceChanged(pace: number) {
  console.log(`pace: ${pace}`);
}

export function onPaceRiskChanged(paceRisk: PaceRisk) {
  console.log(`paceRisk: ${paceRisk}`);
}
