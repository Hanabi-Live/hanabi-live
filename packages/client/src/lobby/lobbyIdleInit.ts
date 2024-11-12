import { MINUTE_IN_MILLISECONDS } from "complete-common";
import { globals } from "../Globals";

const MINUTES_TO_TRIGGER_IDLE = 15;

// From: https://stackoverflow.com/questions/667555/how-to-detect-idle-time-in-javascript-elegantly
export function lobbyIdleInit(): void {
  // Increment the global idle variable every minute.
  setInterval(timerIncrement, MINUTE_IN_MILLISECONDS);

  // Zero the idle timer on mouse movement or keyboard inputs.
  $(document).mousemove(mousemoveOrKeypress);
  $(document).keypress(mousemoveOrKeypress);
}

function mousemoveOrKeypress() {
  if (globals.conn === null) {
    return;
  }

  if (globals.idleMinutes >= MINUTES_TO_TRIGGER_IDLE) {
    globals.conn.send("inactive", {
      inactive: false,
    });
  }
  globals.idleMinutes = 0;
}

function timerIncrement() {
  if (globals.conn === null) {
    return;
  }

  globals.idleMinutes++;
  if (globals.idleMinutes === MINUTES_TO_TRIGGER_IDLE) {
    // We do not want to keep sending "inactive" messages every minute, so we check for being
    // exactly at the cutoff.
    globals.conn.send("inactive", {
      inactive: true,
    });
  }
}
