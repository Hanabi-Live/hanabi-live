import { MINUTE_IN_MILLISECONDS } from "complete-common";
import type { Connection } from "../Connection.ts";
import { globals } from "../Globals.ts";

const MINUTES_TO_TRIGGER_IDLE = 15;

let idleMinutes = 0;

/**
 * The connection that we last told whether we are inactive, and what we told it. The server sees
 * each new connection as active.
 */
let reported:
  { readonly conn: Connection; readonly inactive: boolean } | undefined;

// From: https://stackoverflow.com/questions/667555/how-to-detect-idle-time-in-javascript-elegantly
export function lobbyIdleInit(): void {
  // Increment the global idle variable every minute.
  setInterval(timerIncrement, MINUTE_IN_MILLISECONDS);

  // Zero the idle timer on mouse movement or keyboard inputs.
  document.addEventListener("mousemove", mousemoveOrKeypress);
  document.addEventListener("keypress", mousemoveOrKeypress);
}

function mousemoveOrKeypress() {
  idleMinutes = 0;
  report();
}

function timerIncrement() {
  idleMinutes++;
  report();
}

/**
 * Returns what to tell the server about whether we are inactive, or undefined when it already
 * knows. `known` is what the server has for this connection.
 */
export function getInactiveToReport(
  minutes: number,
  known: boolean,
): boolean | undefined {
  const inactive = minutes >= MINUTES_TO_TRIGGER_IDLE;
  return inactive === known ? undefined : inactive;
}

/**
 * Tells the server whether we are inactive, if it has something else. The timer calls this every
 * minute, so the server also learns it after a reconnect, and after the connection was down when we
 * became inactive.
 */
function report() {
  const { conn } = globals;
  if (conn === undefined) {
    return;
  }

  const known = reported?.conn === conn && reported.inactive;
  const inactive = getInactiveToReport(idleMinutes, known);
  if (inactive === undefined) {
    return;
  }

  reported = {
    conn,
    inactive,
  };
  conn.send("userInactive", { inactive }, (reply) => {
    // The request did not reach the server, so the next call sends it again.
    if (!reply.ok && !reply.refused && reported?.conn === conn) {
      reported = {
        conn,
        inactive: known,
      };
    }
  });
}
