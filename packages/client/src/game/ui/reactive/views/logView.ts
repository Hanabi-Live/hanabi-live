import type { LogEntry } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { globals } from "../../UIGlobals";

export function onLogChanged(log: readonly LogEntry[]): void {
  updateActionLog(log);
  updateFullActionLog(log);
}

function updateActionLog(log: readonly LogEntry[]) {
  const { actionLog } = globals.elements;
  if (actionLog === null) {
    return;
  }

  const startingIndex = Math.max(0, log.length - actionLog.maxLines);
  for (const i of eRange(actionLog.maxLines)) {
    const line =
      startingIndex + i > log.length - 1
        ? ""
        : (log[startingIndex + i]?.text ?? "");
    if (line !== actionLog.smallHistory[i]) {
      actionLog.smallHistory[i] = line;
    }
  }
  actionLog.refreshText();

  globals.layers.UI.batchDraw();
}

function updateFullActionLog(log: readonly LogEntry[]) {
  const { fullActionLog } = globals.elements;
  if (fullActionLog === null) {
    return;
  }

  fullActionLog.reset();
  for (const line of log) {
    fullActionLog.addMessage(line.turn, line.text);
  }

  globals.layers.UI2.batchDraw();
}
