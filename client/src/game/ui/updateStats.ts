/* eslint-disable import/prefer-default-export */
// Functions for the stats on the middle-right-hand side of the game screen

// Imports
import { LABEL_COLOR } from '../../constants';
import * as variantRules from '../rules/variant';
import { PaceRisk } from '../types/GameState';
import globals from './globals';

export const updatePace = (pace: number | null, paceRisk: PaceRisk) => {
  const label = globals.elements.paceNumberLabel;
  if (!label) {
    throw new Error('paceNumberLabel is not initialized.');
  }

  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay) {
    // In "Throw It in a Hole" variants,
    // pace will leak information that the player is not supposed to know
    label.text('?');
    return;
  }

  // Update the pace
  // (part of the efficiency statistics on the right-hand side of the screen)
  // If there are no cards left in the deck, pace is meaningless
  if (pace === null) {
    label.text('-');
    label.fill(LABEL_COLOR);
  } else {
    let paceText = pace.toString();
    if (pace > 0) {
      paceText = `+${pace}`;
    }
    label.text(paceText);

    // Color the pace label depending on how "risky" it would be to discard
    // (approximately)
    switch (paceRisk) {
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
        console.error(`An invalid value of pace / risk was detected. Pace = ${pace}, Risk = Null`);
        break;
      }
    }
  }
};
