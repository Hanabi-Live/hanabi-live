/* eslint-disable import/prefer-default-export */

import { LogEntry } from '../../../types/GameState';
import globals from '../../globals';

export function onLogChanged(log: readonly LogEntry[]) {
  updateActionLog(log);
  updateFullActionLog(log);
}

const updateActionLog = (log: readonly LogEntry[]) => {
  const actionLog = globals.elements.actionLog!;
  const startingIndex = Math.max(0, log.length - actionLog.maxLines);
  for (let i = 0; i < actionLog.maxLines; i++) {
    const line = startingIndex + i > log.length - 1 ? '' : log[startingIndex + i].text;
    if (line !== actionLog.smallHistory[i]) {
      actionLog.smallHistory[i] = line;
    }
  }
  actionLog.refreshText();

  globals.layers.UI.batchDraw();
};

const updateFullActionLog = (log: readonly LogEntry[]) => {
  const fullActionLog = globals.elements.fullActionLog!;
  fullActionLog.reset();
  log.forEach((line) => fullActionLog.addMessage(line.turn, line.text));

  globals.layers.UI2.batchDraw();
};
