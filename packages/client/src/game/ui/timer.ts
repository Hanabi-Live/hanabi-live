// Functions for timed games (and the timer that ticks up in untimed games).

import type { ServerEventData } from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { millisecondsToClockString } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS, assertDefined } from "complete-common";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import { isOurSeat } from "../ourSeat.ts";
import { SoundType } from "../types/SoundType.ts";
import { globals } from "./UiGlobals.ts";
import type { TimerDisplay } from "./controls/TimerDisplay.ts";
import { drawLayer } from "./konvaHelpers.ts";

/** How often the local timer counts down. */
const TICK_MILLISECONDS = SECOND_IN_MILLISECONDS;

/** How far a tick can drift from its interval and still sound the low-time warning. */
const TICK_TOLERANCE_MILLISECONDS = 100;

/** The time left at which the current player hears the low-time warning on every tick. */
const LOW_TIME_WARNING_MILLISECONDS = 10 * SECOND_IN_MILLISECONDS;

/**
 * This function handles the "clock" WebSocket command. It is sent at the beginning of every turn to
 * update the client about each player's clock: the time left in a timed game, or the time taken in
 * an untimed one. It has the following data:
 *
 * ```ts
 * {
 *   times: [100, 200], // A list of the times for each player.
 *   currentPlayerIndex: 0,
 *   timeTaken: 500, // The amount of time that has elapsed since the turn began.
 * }
 * ```
 */
export function update(data: Omit<ServerEventData["clock"], "tableId">): void {
  stop();
  // Absent when the game has no active player.
  const { currentPlayerIndex } = data;

  // We do not need to update the timers if the game is paused. (The server will send another
  // "clock" message when the game becomes unpaused.)
  if (globals.state.pause.pausingPlayerIndex !== undefined) {
    return;
  }

  // Record the data. The player name tooltips and the deck tooltip use it even when the timers are
  // not showing.
  globals.playerTimes = [...data.playerTimesMs];
  globals.clockPlayerIndex = currentPlayerIndex;
  globals.timeTaken = data.turnElapsedMs;

  // Keep track of what the active player's time was when they started their turn.
  globals.startingTurnTime =
    currentPlayerIndex === undefined
      ? 0
      : globals.playerTimes[currentPlayerIndex]!;

  // Mark the time that we updated the local player times.
  globals.lastTimerUpdateTimeMs = Date.now();

  const ourTurn =
    globals.state.playing && isOurSeat(currentPlayerIndex, globals.metadata);
  const { timer1, timer2 } = globals.elements;
  if (timer1 !== undefined && timer2 !== undefined) {
    updateTimerDisplays(timer1, timer2, currentPlayerIndex, ourTurn);
  }

  // Update the timer tooltips for each player.
  for (const i of globals.playerTimes.keys()) {
    const playerIndex = i as PlayerIndex;
    setTickingDownTimePlayerNameTooltip(playerIndex);
  }
  setTickingDownTimeCurrentPlayerTooltip();

  // The server sends no active player when the game is over.
  if (currentPlayerIndex === undefined) {
    return;
  }

  // Start the local timer for the active player. (The timers are not drawn in untimed games unless
  // the player enabled them.)
  const activeTimer = ourTurn ? timer1 : timer2;
  // eslint-disable-next-line unicorn/prefer-global-this
  globals.timerId = window.setInterval(() => {
    setTickingDownTime(activeTimer);
    setTickingDownTimePlayerNameTooltip(currentPlayerIndex);
    setTickingDownTimeCurrentPlayerTooltip();
    globals.elements.deck?.updateDeckTooltip();
  }, TICK_MILLISECONDS);
}

function updateTimerDisplays(
  timer1: TimerDisplay,
  timer2: TimerDisplay,
  currentPlayerIndex: PlayerIndex | undefined,
  ourTurn: boolean,
) {
  if (globals.state.playing) {
    // The visibility of the first timer does not change during a game.
    const { ourPlayerIndex } = globals.metadata;
    assertDefined(ourPlayerIndex, "A player has no seat.");
    const text = millisecondsToClockString(
      globals.playerTimes[ourPlayerIndex]!,
    );
    timer1.setTimerText(text);
  }

  if (!ourTurn && currentPlayerIndex !== undefined) {
    // Update the UI with the value of the timer for the active player.
    const text = millisecondsToClockString(
      globals.playerTimes[currentPlayerIndex]!,
    );
    timer2.setTimerText(text);

    const activePlayerName = globals.metadata.playerNames[currentPlayerIndex];
    if (activePlayerName !== undefined) {
      timer2.setLabelText(activePlayerName);
    }
  }

  timer2.visible(!ourTurn && currentPlayerIndex !== undefined);
  globals.layers.timer.batchDraw();

  // Clear the low-time warning from both timers.
  timer1.clearWarningFlash();
  timer2.clearWarningFlash();
}

/** Stops and hides the timers when the game ends. */
export function hide(): void {
  stop();
  globals.clockPlayerIndex = undefined;
  globals.elements.timer1?.hide();
  globals.elements.timer2?.hide();
  globals.layers.timer.batchDraw();
}

export function stop(): void {
  if (globals.timerId !== undefined) {
    globalThis.clearInterval(globals.timerId);
    globals.timerId = undefined;
  }
}

/**
 * Resize rebuilds recreate timer UI elements and clear the local ticking interval. Rebind the
 * current local clock state to the new timer elements without waiting for the next server "clock"
 * message.
 */
export function resumeAfterResize(): void {
  if (
    globals.state.finished
    || globals.playerTimes.length === 0
    || globals.clockPlayerIndex === undefined
  ) {
    return;
  }

  update({
    playerTimesMs: globals.playerTimes,
    currentPlayerIndex: globals.clockPlayerIndex,
    turnElapsedMs: globals.timeTaken,
  });
}

function setTickingDownTime(timer: TimerDisplay | undefined) {
  // Calculate the elapsed time since the last timer update.
  const now = Date.now();
  const elapsedTime = now - globals.lastTimerUpdateTimeMs;
  globals.lastTimerUpdateTimeMs = now;
  const { clockPlayerIndex } = globals;
  if (elapsedTime < 0 || clockPlayerIndex === undefined) {
    return;
  }

  // Update the time in local array to approximate server times. A timed game's clock counts down
  // the time left and stops at 0. An untimed game's clock counts up the time taken.
  const timed = globals.options.timeControl !== undefined;
  const clock = globals.playerTimes[clockPlayerIndex]!;
  globals.playerTimes[clockPlayerIndex] = timed
    ? Math.max(clock - elapsedTime, 0)
    : clock + elapsedTime;

  const milliseconds = globals.playerTimes[clockPlayerIndex];
  if (timer === undefined) {
    return;
  }
  const text = millisecondsToClockString(milliseconds);
  timer.setTimerText(text);
  drawLayer(timer);

  // Play a sound to indicate that the current player is almost out of time. Do not play it more
  // frequently than once per tick.
  if (
    timed
    && store.getState().session.settings.soundTimer
    && milliseconds > 0
    && milliseconds <= LOW_TIME_WARNING_MILLISECONDS
    && Math.abs(elapsedTime - TICK_MILLISECONDS) < TICK_TOLERANCE_MILLISECONDS
    && globals.state.pause.pausingPlayerIndex === undefined
    && !store.getState().session.errorOccurred
  ) {
    timer.toggleWarningFlash();
    globals.game!.sounds.play(SoundType.Tone);
  }
}

/** Update the tooltip that appears when you hover over a player's name. */
function setTickingDownTimePlayerNameTooltip(playerIndex: PlayerIndex) {
  // This tooltip is disabled in speedrun mode.
  if (
    store.getState().session.settings.speedrunFeatures
    || globals.options.speedrun
  ) {
    return;
  }

  const playerTime = globals.playerTimes[playerIndex];
  if (playerTime === undefined) {
    return;
  }

  let content = "Time ";
  content += globals.options.timeControl === undefined ? "taken" : "remaining";
  content += ":<br /><strong>";
  content += millisecondsToClockString(playerTime);
  content += "</strong>";
  tooltips.setContent(`player-${playerIndex}`, content);
}

function setTickingDownTimeCurrentPlayerTooltip() {
  // This tooltip is disabled in non-timed games.
  const { clockPlayerIndex } = globals;
  if (
    (globals.options.timeControl === undefined
      && !store.getState().session.settings.showTimerInUntimed)
    || clockPlayerIndex === undefined
  ) {
    return;
  }

  // Update the tooltip that appears when you hover over the current player's timer. The clock
  // counts down in timed games and up in untimed games, so the time since the "clock" message is
  // how far it moved either way.
  const sinceUpdate = Math.abs(
    globals.playerTimes[clockPlayerIndex]! - globals.startingTurnTime,
  );

  // Add the time that passed in this turn before the "clock" message, as the server reports it. The
  // client does not know it otherwise, such as when the page is refreshed in the middle of a turn.
  // "globals.timeTaken" is 0 if the client was connected when the turn began.
  const time = sinceUpdate + globals.timeTaken;

  let content = "Time taken on this turn:<br /><strong>";
  content += millisecondsToClockString(time);
  content += "</strong>";
  tooltips.setContent("time-taken", content);
}
