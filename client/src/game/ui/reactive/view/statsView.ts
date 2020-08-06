import { PaceRisk } from '../../../types/GameState';
import { LABEL_COLOR } from '../../constants';
import globals from '../../globals';

// onEfficiencyChanged updates the labels on the right-hand side of the screen
export const onEfficiencyChanged = (efficiency: number) => {
  const effLabel = globals.elements.efficiencyNumberLabel;
  if (!effLabel) {
    throw new Error('efficiencyNumberLabel is not initialized in the "onEfficiencyChanged()" function.');
  }
  const effMinLabel = globals.elements.efficiencyNumberLabelMinNeeded;
  if (!effMinLabel) {
    throw new Error('efficiencyNumberLabelMinNeeded is not initialized in the "onEfficiencyChanged()" function.');
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

  globals.layers.UI.batchDraw();
};

export const onPaceOrPaceRiskChanged = (data: {
  pace: number | null;
  paceRisk: PaceRisk;
}) => {
  const label = globals.elements.paceNumberLabel;
  if (!label) {
    throw new Error('paceNumberLabel is not initialized.');
  }

  // Update the pace
  // (part of the efficiency statistics on the right-hand side of the screen)
  // If there are no cards left in the deck, pace is meaningless
  if (data.pace === null) {
    label.text('-');
    label.fill(LABEL_COLOR);
  } else {
    let paceText = data.pace.toString();
    if (data.pace > 0) {
      paceText = `+${data.pace}`;
    }
    label.text(paceText);

    // Color the pace label depending on how "risky" it would be to discard
    // (approximately)
    switch (data.paceRisk) {
      case 'Zero': {
        // No more discards can occur in order to get a maximum score
        label.fill('#df1c2d'); // Red
        break;
      }
      case 'HighRisk': {
        // It would probably be risky to discard
        label.fill('#ef8c1d'); // Orange
        break;
      }
      case 'MediumRisk': {
        // It might be risky to discard
        label.fill('#efef1d'); // Yellow
        break;
      }
      case 'LowRisk': default: {
        // We are not even close to the "End-Game", so give it the default color
        label.fill(LABEL_COLOR);
        break;
      }
      case 'Null': {
        console.error(`An invalid value of pace / risk was detected. Pace = ${data.pace}, Risk = Null`);
        break;
      }
    }
  }

  globals.layers.UI.batchDraw();
};
