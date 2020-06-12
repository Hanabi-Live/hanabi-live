// Functions for the stats on the middle-right-hand side of the game screen

// Imports
import { LABEL_COLOR } from '../../constants';
import globals from './globals';

export const updatePace = () => {
  const label = globals.elements.paceNumberLabel;
  if (!label) {
    throw new Error('paceNumberLabel is not initialized.');
  }

  if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay) {
    // In "Throw It in a Hole" variants,
    // pace will leak information that the player is not supposed to know
    label.text('?');
    return;
  }

  const adjustedScorePlusDeck = globals.score + globals.deckSize - globals.maxScore;

  // Formula derived by Libster;
  // the number of discards that can happen while still getting the maximum score
  // (this is represented to the user as "Pace" on the user interface)
  const endGameThreshold1 = adjustedScorePlusDeck + globals.playerNames.length;

  // Formula derived by Florrat;
  // a strategical estimate of "End-Game" that tries to account for the number of players
  const endGameThreshold2 = adjustedScorePlusDeck + Math.floor(globals.playerNames.length / 2);

  // Formula derived by Hyphen-ated;
  // a more conservative estimate of "End-Game" that does not account for
  // the number of players
  const endGameThreshold3 = adjustedScorePlusDeck;

  // Update the pace
  // (part of the efficiency statistics on the right-hand side of the screen)
  // If there are no cards left in the deck, pace is meaningless
  if (globals.deckSize === 0) {
    label.text('-');
    label.fill(LABEL_COLOR);
  } else {
    let paceText = endGameThreshold1.toString();
    if (endGameThreshold1 > 0) {
      paceText = `+${endGameThreshold1}`;
    }
    label.text(paceText);

    // Color the pace label depending on how "risky" it would be to discard
    // (approximately)
    if (endGameThreshold1 <= 0) {
      // No more discards can occur in order to get a maximum score
      label.fill('#df1c2d'); // Red
    } else if (endGameThreshold2 < 0) {
      // It would probably be risky to discard
      label.fill('#ef8c1d'); // Orange
    } else if (endGameThreshold3 < 0) {
      // It might be risky to discard
      label.fill('#efef1d'); // Yellow
    } else {
      // We are not even close to the "End-Game", so give it the default color
      label.fill(LABEL_COLOR);
    }
  }
};

export const updateEfficiency = (cardsGottenDelta: number) => {
  const effLabel = globals.elements.efficiencyNumberLabel;
  if (!effLabel) {
    throw new Error('efficiencyNumberLabel is not initialized.');
  }

  if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay) {
    // In "Throw It in a Hole" variants,
    // efficiency will leak information that the player is not supposed to know
    effLabel.text('? / ');
    return;
  }

  globals.cardsGotten += cardsGottenDelta;
  const efficiency = (globals.cardsGotten / globals.cluesSpentPlusStrikes).toFixed(2);
  // Round it to 2 decimal places

  // Update the labels on the right-hand side of the screen
  if (globals.cluesSpentPlusStrikes === 0) {
    // First, handle the case in which 0 clues have been given
    effLabel.text('- / ');
  } else {
    effLabel.text(`${efficiency} / `);
    effLabel.width(effLabel.measureSize(effLabel.text()).width);
  }

  const effMinLabel = globals.elements.efficiencyNumberLabelMinNeeded;
  if (!effMinLabel) {
    throw new Error('efficiencyNumberLabelMinNeeded is not initialized.');
  }
  const x = effLabel.x() + effLabel.measureSize(effLabel.text()).width;
  effMinLabel.x(x);
};
