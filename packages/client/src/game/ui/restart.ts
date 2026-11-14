import { MIN_PLAYERS } from "@hanabi-live/game";
import { globals as lobbyGlobals } from "../../Globals.ts";
import * as gameSession from "../gameSession.ts";
import type { SharedReplayState } from "../types/SharedReplayState.ts";
import { globals } from "./UiGlobals.ts";

/** Tells the leader whether we will play again if they restart. */
export function decline(declined: boolean): void {
  lobbyGlobals.connection.send("tableRestartDecline", {
    tableId: lobbyGlobals.joinedTableId,
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

/** Asks to play again: at once with the same players, or else in a new pregame. */
export function request(startNow: boolean): void {
  if (gameSession.isRestartPending()) {
    return;
  }

  setPending(true);
  lobbyGlobals.connection.send(
    "tableRestart",
    { tableId: lobbyGlobals.joinedTableId, startNow },
    (reply) => {
      // A restart that succeeds leaves this replay.
      if (!reply.ok) {
        setPending(false);
      }
    },
  );
}

export function setPending(pending: boolean): void {
  gameSession.setRestartPending(pending);
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
