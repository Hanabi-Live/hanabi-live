import type { LogEntry } from "@hanabi-live/game";
import { globals } from "../../UIGlobals.ts";

export function onLogChanged(log: readonly LogEntry[]): void {
  updateActionLog(log);
  updateFullActionLog(log);
}

function updateActionLog(log: readonly LogEntry[]) {
  const { actionLog } = globals.elements;
  if (actionLog === undefined) {
    return;
  }

  actionLog.update(log);

  globals.layers.UI.batchDraw();
}

function updateFullActionLog(log: readonly LogEntry[]) {
  const { fullActionLog } = globals.elements;
  if (fullActionLog === undefined) {
    return;
  }

  fullActionLog.reset();
  for (const line of log) {
    fullActionLog.addMessage(line.turn, line.text);
  }

  globals.layers.UI2.batchDraw();
}
