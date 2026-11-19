// When the page loads and we go back to a table, the login screen's wait stays up until the table
// shows: its pre-game screen, or its game once the game shows its state. Otherwise, the page first
// flips through the lobby and an empty game screen.

import * as gameMain from "./game/main.ts";
import * as lobbyLogin from "./lobby/login.ts";

let waiting = false;

/** Keeps the wait up until the table that we go to shows. */
export function wait(): void {
  waiting = true;
}

/** Whether the page waits for a table to show before it leaves the login screen. */
export function isWaiting(): boolean {
  return waiting;
}

/** Leaves the login screen for the game that we went to, now that it shows its state. */
export function onGameShown(): void {
  if (!waiting) {
    return;
  }

  leave();
  gameMain.revealHeldGame();
}

/**
 * Leaves the login screen for the lobby, such as when the server refuses to take us back to a
 * table. It does nothing once the page has left the login screen.
 */
export function leave(): void {
  if (!waiting) {
    return;
  }

  waiting = false;
  lobbyLogin.hide(false);
}
