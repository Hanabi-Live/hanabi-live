import { MIN_PLAYERS } from "@hanabi-live/game";
import type { SharedReplayState } from "../types/SharedReplayState";
import { globals } from "./UIGlobals";

/** Tells the leader whether we will play again if they restart. */
export function decline(declined: boolean): void {
  globals.lobby.conn!.send("tableRestartDecline", {
    tableID: globals.lobby.tableID,
    declined,
  });
}

/** The players who will not play again, other than the leader (who plays if they restart). */
export function declinedPlayers(
  shared: Pick<SharedReplayState, "leader" | "restartDeclined">,
): readonly string[] {
  return shared.restartDeclined.filter((name) => name !== shared.leader);
}

/** Whether enough players will play again for the leader to restart. */
export function canRestart(
  shared: Pick<SharedReplayState, "leader" | "restartDeclined">,
  playerNames: readonly string[],
): boolean {
  const declined = declinedPlayers(shared);
  const willing = playerNames.filter((name) => !declined.includes(name));
  return willing.length >= MIN_PLAYERS;
}

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
