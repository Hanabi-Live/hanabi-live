/* eslint-disable import/prefer-default-export */

import { cluesRules } from '../../../rules';
import Clue, { rankClue, colorClue } from '../../../types/Clue';
import ClueType from '../../../types/ClueType';
import { StateClue } from '../../../types/GameState';
import * as arrows from '../../arrows';
import ClueEntry from '../../ClueEntry';
import globals from '../../globals';

export function onCluesChanged(data: { clues: readonly StateClue[]; turn: number }) {
  updateArrows(data.clues, data.turn);
  updateLog(data.clues);
}

function updateArrows(clues: readonly StateClue[], turn: number) {
  arrows.hideAll();

  const lastClue = clues[clues.length - 1];
  if (!lastClue || lastClue.turn !== turn - 1) {
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
}

function updateLog(clues: readonly StateClue[]) {
  const clueLog = globals.elements.clueLog!;
  const startingIndex = Math.max(0, clues.length - clueLog.maxLength);
  clues.slice(startingIndex).forEach((clue, i) => {
    // TODO: use character and playerNames from state
    const characterID = globals.characterAssignments[clue.giver];

    const entry = new ClueEntry({
      width: clueLog.width(),
      height: 0.017 * globals.stage.height(),
      giver: globals.playerNames[clue.giver],
      target: globals.playerNames[clue.target],
      clueName: cluesRules.getClueName(clue, globals.variant, characterID),
      list: clue.list,
      negativeList: clue.negativeList,
      turn: clue.turn,
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
}
