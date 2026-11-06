import { globals } from "./UIGlobals";

export function request(hidePregame: boolean): void {
  if (globals.restartPending) {
    return;
  }

  setPending(true);
  globals.lobby.conn!.send("tableRestart", {
    tableID: globals.lobby.tableID,
    hidePregame,
  });
}

export function setPending(pending: boolean): void {
  globals.restartPending = pending;
  globals.elements.restartButton?.setEnabled(!pending);
  globals.elements.restartContents?.visible(!pending);
  globals.elements.restartWaitingOnServer?.visible(pending);
  if (pending) {
    globals.elements.restartArea?.show();
    globals.elements.restartWaitingOnServerAnimation?.start();
  } else {
    globals.elements.restartWaitingOnServerAnimation?.stop();
  }
  globals.layers.UI2.batchDraw();
}
