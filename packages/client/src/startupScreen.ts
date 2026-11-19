// When the page loads, the login screen's wait stays up until the screen that we go to is ready:
// the lobby once it lists the tables, or a game once it shows its state. Otherwise, the page first
// flips through an empty lobby and an empty game screen.

import * as gameMain from "./game/main.ts";
import * as lobbyLogin from "./lobby/login.ts";

/** What the wait is for, if the page is still waiting. */
let waitingFor: "tables" | "table" | undefined;

/**
 * Keeps the wait up until the lobby lists the tables, or until the table that we go to shows: its
 * pre-game screen, or its game once the game shows its state.
 */
export function wait(destination: "tables" | "table"): void {
  waitingFor = destination;
}

/** Whether the page waits for a game to show before it leaves the login screen. */
export function isWaitingForGame(): boolean {
  return waitingFor === "table";
}

/** Leaves the login screen for the lobby once the server lists the tables. */
export function onTablesListed(): void {
  if (waitingFor === "tables") {
    leave();
  }
}

/** Leaves the login screen for the game that we went to, now that it shows its state. */
export function onGameShown(): void {
  if (waitingFor !== "table") {
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
  if (waitingFor === undefined) {
    return;
  }

  waitingFor = undefined;
  lobbyLogin.hide(false);
}
