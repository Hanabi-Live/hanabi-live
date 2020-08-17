/* eslint-disable import/prefer-default-export */

import equal from 'fast-deep-equal';
import Clue, { rankClue, colorClue } from '../../../types/Clue';
import ClueType from '../../../types/ClueType';
import { StateClue } from '../../../types/GameState';
import * as arrows from '../../arrows';
import ClueEntry from '../../ClueEntry';
import globals from '../../globals';

export const onCluesChanged = (data: {
  clues: readonly StateClue[];
  segment: number | null;
}) => {
  updateArrows(data.clues, data.segment);
  updateLog(data.clues);
};

const updateArrows = (clues: readonly StateClue[], segment: number | null) => {
  arrows.hideAll();

  if (segment === null) {
    return;
  }

  const lastClue = clues[clues.length - 1];
  if (lastClue === undefined || lastClue.segment !== segment - 1) {
    // We are initializing (or we rewinded and just removed the first clue)
    return;
  }

  let clue: Clue;
  if (lastClue.type === ClueType.Rank) {
    clue = rankClue(lastClue.value);
  } else {
    clue = colorClue(globals.variant.clueColors[lastClue.value]);
  }

  lastClue.list.forEach((order, i) => {
    arrows.set(i, globals.deck[order], lastClue.giver, clue);
  });

  globals.layers.arrow.batchDraw();
};

const updateLog = (clues: readonly StateClue[]) => {
  const clueLog = globals.elements.clueLog!;
  const startingIndex = Math.max(0, clues.length - clueLog.maxLength);
  clues.slice(startingIndex).forEach((clue, i) => {
    if (i < clueLog.children.length) {
      const clueEntry = clueLog.children[i] as unknown as ClueEntry;
      if (equal(clue, clueEntry.clue)) {
        // No change
        return;
      }
    }

    const entry = new ClueEntry(clue, {
      width: clueLog.width(),
      height: 0.017 * globals.stage.height(),
      listening: false,
    });
    if (i < clueLog.children.length) {
      clueLog.updateClue(i, entry);
    } else {
      clueLog.addClue(entry);
    }
  });

  // Delete any left over clues
  if (clueLog.children.length > clues.length) {
    clueLog.children.splice(clues.length, clueLog.children.length - clues.length);
  }
  clueLog.refresh();

  globals.layers.UI.batchDraw();
};
