import * as variantRules from '../../../rules/variant';
import { PaceRisk } from '../../../types/GameState';
import globals from '../../globals';

// onEfficiencyChanged updates the labels on the right-hand side of the screen
export function onEfficiencyChanged(efficiency: number) {
  const effLabel = globals.elements.efficiencyNumberLabel;
  if (!effLabel) {
    throw new Error('efficiencyNumberLabel is not initialized in the "onEfficiencyChanged()" function.');
  }
  const effMinLabel = globals.elements.efficiencyNumberLabelMinNeeded;
  if (!effMinLabel) {
    throw new Error('efficiencyNumberLabelMinNeeded is not initialized in the "onEfficiencyChanged()" function.');
  }

  // In "Throw It in a Hole" variants,
  // efficiency will leak information that the player is not supposed to know
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay) {
    effLabel.text('? / ');
    return;
  }

  if (efficiency === Infinity) {
    // First, handle the case in which 0 clues have been given
    // (or the case when one or more players successfully blind-play a card before any clues have
    // been given)
    effLabel.text('- / ');
  } else {
    // Otherwise, show the efficiency and round it to 2 decimal places
    effLabel.text(`${efficiency.toFixed(2)} / `);
    effLabel.width(effLabel.measureSize(effLabel.text()).width);
  }

  // Even though the maximum efficiency needed has not changed,
  // we might need to reposition the label
  // (since it should be directly to the right of the efficiency label)
  const x = effLabel.x() + effLabel.measureSize(effLabel.text()).width as number;
  effMinLabel.x(x);
}

export function onPaceChanged(pace: number) {
  console.log(`pace: ${pace}`);
}

export function onPaceRiskChanged(paceRisk: PaceRisk) {
  console.log(`paceRisk: ${paceRisk}`);
}
