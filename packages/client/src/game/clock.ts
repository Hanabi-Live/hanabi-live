// The players' clocks in a game in progress: the time left in a timed game, or the time taken in an
// untimed one. The server sends them in a "clock" message at the start of every turn, and the
// client counts the active player's clock between messages. Both game screens read it.

import type { ServerEventData } from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import * as sounds from "../sounds.ts";
import { store } from "../store.ts";
import { SoundType } from "./types/SoundType.ts";

/** How often the local clock counts. */
const TICK_MILLISECONDS = SECOND_IN_MILLISECONDS;

/** How far a tick can drift from its interval and still sound the low-time warning. */
const TICK_TOLERANCE_MILLISECONDS = 100;

/** The time left at which the current player hears the low-time warning on every tick. */
const LOW_TIME_WARNING_MILLISECONDS = 10 * SECOND_IN_MILLISECONDS;

export type ClockChange =
  /** The server sent the clocks, or they stopped because the game ended. */
  | { readonly type: "update" }
  /** The active player's clock counted. `warning` is set when the low-time warning sounded. */
  | { readonly type: "tick"; readonly warning: boolean };

type Listener = (change: ClockChange) => void;

/** Each player's time, in milliseconds. It is empty until the first "clock" message. */
let playerTimes: number[] = [];

/**
 * The player whose clock is running. It indexes `playerTimes` from the same message, so it is not
 * read from the game state.
 */
let activePlayerIndex: PlayerIndex | undefined;

/** The time that had passed in this turn when the "clock" message was sent. */
let turnElapsedMs = 0;

/** The active player's time when the "clock" message was sent. */
let startingTurnTime = 0;

let lastTickMs = 0;
let intervalId: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<Listener>();

/** Calls the listener when the clocks change. Returns the function that stops listening. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(change: ClockChange) {
  for (const listener of listeners) {
    listener(change);
  }
}

export function getPlayerTime(playerIndex: PlayerIndex): number | undefined {
  return playerTimes[playerIndex];
}

export function getPlayerTimes(): readonly number[] {
  return playerTimes;
}

export function getActivePlayerIndex(): PlayerIndex | undefined {
  return activePlayerIndex;
}

/**
 * How long the active player has taken on this turn, including the time before the "clock" message.
 * The clock counts down in timed games and up in untimed games, so the time since the message is
 * how far it moved either way.
 */
export function getTurnTime(): number | undefined {
  if (activePlayerIndex === undefined) {
    return undefined;
  }

  const sinceUpdate = Math.abs(
    playerTimes[activePlayerIndex]! - startingTurnTime,
  );
  return sinceUpdate + turnElapsedMs;
}

/** Handles the server's "clock" message, and starts counting the active player's clock. */
export function update(data: Omit<ServerEventData["clock"], "tableId">): void {
  stop();

  // The clocks do not count while the game is paused. (The server sends another "clock" message
  // when the game is unpaused.)
  if (store.getState().game.current?.pause.pausingPlayerIndex !== undefined) {
    return;
  }

  playerTimes = [...data.playerTimesMs];
  ({ currentPlayerIndex: activePlayerIndex, turnElapsedMs } = data);
  startingTurnTime =
    activePlayerIndex === undefined ? 0 : playerTimes[activePlayerIndex]!;
  lastTickMs = Date.now();
  notify({ type: "update" });

  // The server sends no active player when the game is over.
  if (activePlayerIndex !== undefined) {
    intervalId = setInterval(tick, TICK_MILLISECONDS);
  }
}

function tick() {
  const now = Date.now();
  const elapsedTime = now - lastTickMs;
  lastTickMs = now;
  const state = store.getState().game.current;
  if (
    elapsedTime < 0
    || activePlayerIndex === undefined
    || state === undefined
  ) {
    return;
  }

  // A timed game's clock counts down the time left and stops at 0. An untimed game's clock counts
  // up the time taken.
  const timed = state.metadata.options.timeControl !== undefined;
  const clock = playerTimes[activePlayerIndex]!;
  const milliseconds = timed
    ? Math.max(clock - elapsedTime, 0)
    : clock + elapsedTime;
  playerTimes[activePlayerIndex] = milliseconds;

  // Play a sound to tell the current player that they are almost out of time. Do not play it more
  // than once per tick.
  const { session } = store.getState();
  const warning =
    timed
    && session.settings.soundTimer
    && milliseconds > 0
    && milliseconds <= LOW_TIME_WARNING_MILLISECONDS
    && Math.abs(elapsedTime - TICK_MILLISECONDS) < TICK_TOLERANCE_MILLISECONDS
    && state.pause.pausingPlayerIndex === undefined
    && !session.errorOccurred;
  if (warning) {
    sounds.play(SoundType.Tone);
  }

  notify({
    type: "tick",
    warning,
  });
}

/** Stops counting the active player's clock. */
export function stop(): void {
  if (intervalId !== undefined) {
    clearInterval(intervalId);
    intervalId = undefined;
  }
}

/** Stops the clocks when the game ends. No player's clock runs after it. */
export function finish(): void {
  stop();
  activePlayerIndex = undefined;
  notify({ type: "update" });
}

/** Forgets the clocks of the game that closed. */
export function reset(): void {
  stop();
  playerTimes = [];
  activePlayerIndex = undefined;
  turnElapsedMs = 0;
  startingTurnTime = 0;
}
