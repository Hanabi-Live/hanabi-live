// The server closes a replay that nobody uses for a while. In a shared replay, it sees the chat and
// what the leader does. In a solo replay, going to another turn sends the server nothing, so we
// tell it that the viewer is there.

import { MINUTE_IN_MILLISECONDS } from "complete-common";
import { globals } from "../Globals.ts";
import { store } from "../store.ts";
import * as gameSession from "./gameSession.ts";

/** The shortest time between two reports, so that they add almost no traffic. */
const REPORT_INTERVAL_MILLISECONDS = MINUTE_IN_MILLISECONDS;

/** When we last told the server that the viewer is there. */
let lastReport = 0;

export function replayActivityInit(): void {
  // A key covers the arrow keys, and a pointer press covers a touch screen.
  for (const type of ["mousemove", "keydown", "pointerdown"] as const) {
    document.addEventListener(type, onActivity, {
      passive: true,
    });
  }
}

/** Whether enough time has passed since the last report to send another one. */
function isReportDue(now: number, last: number): boolean {
  return now - last >= REPORT_INTERVAL_MILLISECONDS;
}

function isInSoloReplay(): boolean {
  if (!gameSession.isOpen() || gameSession.isLoading()) {
    return false;
  }

  const state = store.getState().game.current;
  return (
    state !== undefined && state.finished && state.replay.shared === undefined
  );
}

function onActivity() {
  const now = Date.now();
  if (
    !isReportDue(now, lastReport)
    || globals.conn === undefined
    || !isInSoloReplay()
  ) {
    return;
  }

  lastReport = now;
  globals.conn.send(
    "idleReset",
    { tableId: globals.joinedTableId },
    (reply) => {
      // The report did not reach the server, so the next activity sends it again.
      if (!reply.ok && !reply.refused) {
        lastReport = 0;
      }
    },
  );
}
