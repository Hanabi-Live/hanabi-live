import * as cluesRules from '../../../rules/clues';
import { LogEntry, StateClue } from '../../../types/GameState';
import ClueEntry from '../../ClueEntry';
import globals from '../../globals';

export function onLogChanged(log: readonly LogEntry[]) {
  const actionLog = globals.elements.actionLog!;
  const fullActionLog = globals.elements.fullActionLog!;

  const startingIndex = Math.max(0, log.length - actionLog.maxLines);
  for (let i = 0; i < actionLog.maxLines; i++) {
    const line = startingIndex + i > log.length - 1 ? '' : log[startingIndex + i].text;
    if (line !== actionLog.smallHistory[i]) {
      actionLog.smallHistory[i] = line;
    }
  }
  actionLog.refreshText();

  fullActionLog.reset();
  log.forEach((line) => fullActionLog.addMessage(line.turn, line.text));

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
    globals.layers.UI2.batchDraw();
  }
}

export function onCluesChanged(clues: readonly StateClue[]) {
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
}
