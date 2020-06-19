// Functions for the stats on the middle-right-hand side of the game screen

// Imports
import { LABEL_COLOR } from '../../constants';
import * as statsRules from '../rules/stats';
import * as variantRules from '../rules/variant';
import { PaceRisk } from '../types/State';
import globals from './globals';

export const updatePace = (pace: number, paceStatus: PaceRisk, deckSize: number) => {
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
  if (deckSize === 0) {
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
    switch (paceStatus) {
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
    }
  }
};

export const updateEfficiency = (cardsGottenDelta: number) => {
  const effLabel = globals.elements.efficiencyNumberLabel;
  if (!effLabel) {
    throw new Error('efficiencyNumberLabel is not initialized.');
  }

  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay) {
    // In "Throw It in a Hole" variants,
    // efficiency will leak information that the player is not supposed to know
    effLabel.text('? / ');
    return;
  }

  globals.cardsGotten += cardsGottenDelta;
  const efficiency = statsRules.efficiency(globals.cardsGotten, globals.cluesSpentPlusStrikes);

  // Update the labels on the right-hand side of the screen
  if (globals.cluesSpentPlusStrikes === 0) {
    // First, handle the case in which 0 clues have been given
    effLabel.text('- / ');
  } else {
    // Round it to 2 decimal places
    effLabel.text(`${efficiency.toFixed(2)} / `);
    effLabel.width(effLabel.measureSize(effLabel.text()).width);
  }

  const effMinLabel = globals.elements.efficiencyNumberLabelMinNeeded;
  if (!effMinLabel) {
    throw new Error('efficiencyNumberLabelMinNeeded is not initialized.');
  }
  const x = effLabel.x() + effLabel.measureSize(effLabel.text()).width as number;
  effMinLabel.x(x);
};
