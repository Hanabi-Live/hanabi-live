// Functions for timed games (and the timer that ticks up in untimed games).

import type { ServerCommandData } from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { millisecondsToClockString, NO_VALUE } from "@hanabi-live/game";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import * as tooltips from "../../tooltips";
import { SoundType } from "../types/SoundType";
import { globals } from "./UIGlobals";
import type { TimerDisplay } from "./controls/TimerDisplay";
import { drawLayer } from "./konvaHelpers";

/** How often the local timer counts down. */
const TICK_MILLISECONDS = SECOND_IN_MILLISECONDS;

/** How far a tick can drift from its interval and still sound the low-time warning. */
const TICK_TOLERANCE_MILLISECONDS = 100;

/** The time left at which the current player hears the low-time warning on every tick. */
const LOW_TIME_WARNING_MILLISECONDS = 10 * SECOND_IN_MILLISECONDS;

/**
 * This function handles the "clock" WebSocket command. It is sent at the beginning of every turn to
 * update the client about how much time each player has left. It has the following data:
 *
 * ```ts
 * {
 *   times: [100, 200], // A list of the times for each player.
 *   activePlayerIndex: 0,
 *   timeTaken: 500, // The amount of time that has elapsed since the turn began.
 * }
 * ```
 */
export function update(
  data: Omit<ServerCommandData["clock"], "tableID">,
): void {
  stop();
  // Absent if the game just ended.
  const { activePlayerIndex } = data;

  if (globals.state.finished) {
    globals.clockPlayerIndex = undefined;
    globals.elements.timer1?.hide();
    globals.elements.timer2?.hide();
    globals.layers.timer.batchDraw();
    return;
  }

  // We do not need to update the timers if the game is paused. (The server will send another
  // "clock" message when the game becomes unpaused.)
  if (globals.state.pause.playerIndex !== undefined) {
    return;
  }

  // Record the data. The player name tooltips and the deck tooltip use it even when the timers are
  // not showing.
  globals.playerTimes = data.playerTimesMs;
  globals.clockPlayerIndex = activePlayerIndex;
  globals.timeTaken = data.timeTakenMs;

  // Keep track of what the active player's time was when they started their turn.
  globals.startingTurnTime =
    activePlayerIndex === undefined
      ? 0
      : globals.playerTimes[activePlayerIndex]!;

  // Mark the time that we updated the local player times.
  globals.lastTimerUpdateTimeMS = Date.now();

  const ourTurn =
    globals.state.playing
    && activePlayerIndex === globals.metadata.ourPlayerIndex;
  const { timer1, timer2 } = globals.elements;
  if (timer1 !== undefined && timer2 !== undefined) {
    updateTimerDisplays(timer1, timer2, activePlayerIndex, ourTurn);
  }

  // Update the timer tooltips for each player.
  for (const i of globals.playerTimes.keys()) {
    const playerIndex = i as PlayerIndex;
    setTickingDownTimePlayerNameTooltip(playerIndex);
  }
  setTickingDownTimeCurrentPlayerTooltip();

  // The server sends no active player when the game is over.
  if (activePlayerIndex === undefined) {
    return;
  }

  // Start the local timer for the active player. (The timers are not drawn in untimed games unless
  // the player enabled them.)
  const activeTimer = ourTurn ? timer1 : timer2;
  // eslint-disable-next-line unicorn/prefer-global-this
  globals.timerID = window.setInterval(() => {
    setTickingDownTime(activeTimer);
    setTickingDownTimePlayerNameTooltip(activePlayerIndex);
    setTickingDownTimeCurrentPlayerTooltip();
    globals.elements.deck?.updateDeckTooltip();
  }, TICK_MILLISECONDS);
}

function updateTimerDisplays(
  timer1: TimerDisplay,
  timer2: TimerDisplay,
  activePlayerIndex: PlayerIndex | undefined,
  ourTurn: boolean,
) {
  if (globals.state.playing) {
    // The visibility of the first timer does not change during a game.
    let time = globals.playerTimes[globals.metadata.ourPlayerIndex]!;
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking.
      time *= -1;
    }

    const text = millisecondsToClockString(time);
    timer1.setTimerText(text);
  }

  if (!ourTurn && activePlayerIndex !== undefined) {
    // Update the UI with the value of the timer for the active player.
    let time = globals.playerTimes[activePlayerIndex]!;
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking.
      time *= -1;
    }

    const text = millisecondsToClockString(time);
    timer2.setTimerText(text);

    const activePlayerName = globals.metadata.playerNames[activePlayerIndex];
    if (activePlayerName !== undefined) {
      timer2.setLabelText(activePlayerName);
    }
  }

  timer2.visible(!ourTurn && activePlayerIndex !== undefined);
  globals.layers.timer.batchDraw();

  // Clear the low-time warning from both timers.
  timer1.clearWarningFlash();
  timer2.clearWarningFlash();
}

export function stop(): void {
  if (globals.timerID !== undefined) {
    globalThis.clearInterval(globals.timerID);
    globals.timerID = undefined;
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
    activePlayerIndex: globals.clockPlayerIndex,
    timeTakenMs: globals.timeTaken,
  });
}

function setTickingDownTime(timer: TimerDisplay | undefined) {
  // Calculate the elapsed time since the last timer update.
  const now = Date.now();
  const elapsedTime = now - globals.lastTimerUpdateTimeMS;
  globals.lastTimerUpdateTimeMS = now;
  const { clockPlayerIndex } = globals;
  if (elapsedTime < 0 || clockPlayerIndex === undefined) {
    return;
  }

  // Update the time in local array to approximate server times.
  globals.playerTimes[clockPlayerIndex]! -= elapsedTime;
  if (globals.options.timed && globals.playerTimes[clockPlayerIndex]! < 0) {
    // Do not let the timer go into negative values, or else it will mess up the display. (But in
    // non-timed games, we want this to happen.)
    globals.playerTimes[clockPlayerIndex] = 0;
  }

  let millisecondsLeft = globals.playerTimes[clockPlayerIndex]!;
  if (!globals.options.timed) {
    // Invert it to show how much time each player is taking.
    millisecondsLeft *= -1;
  }
  if (timer === undefined) {
    return;
  }
  const text = millisecondsToClockString(millisecondsLeft);
  timer.setTimerText(text);
  drawLayer(timer);

  // Play a sound to indicate that the current player is almost out of time. Do not play it more
  // frequently than once per tick.
  if (
    globals.options.timed
    && globals.lobby.settings.soundTimer
    && millisecondsLeft > 0
    && millisecondsLeft <= LOW_TIME_WARNING_MILLISECONDS
    && Math.abs(elapsedTime - TICK_MILLISECONDS) < TICK_TOLERANCE_MILLISECONDS
    && globals.state.pause.playerIndex === undefined
    && !globals.lobby.errorOccurred
  ) {
    timer.toggleWarningFlash();
    globals.game!.sounds.play(SoundType.Tone);
  }
}

/** Update the tooltip that appears when you hover over a player's name. */
function setTickingDownTimePlayerNameTooltip(
  playerIndex: PlayerIndex | typeof NO_VALUE,
) {
  // This tooltip is disabled in speedrun mode.
  if (
    playerIndex === NO_VALUE
    || globals.lobby.settings.speedrunMode
    || globals.options.speedrun
  ) {
    return;
  }

  const playerTime = globals.playerTimes[playerIndex];
  if (playerTime === undefined) {
    return;
  }

  // Invert it to show how much time each player is taking.
  const milliseconds = globals.options.timed ? playerTime : -playerTime;

  let content = "Time ";
  content += globals.options.timed ? "remaining" : "taken";
  content += ":<br /><strong>";
  content += millisecondsToClockString(milliseconds);
  content += "</strong>";
  tooltips.setContent(`#tooltip-player-${playerIndex}`, content);
}

function setTickingDownTimeCurrentPlayerTooltip() {
  // This tooltip is disabled in non-timed games.
  const { clockPlayerIndex } = globals;
  if (
    (!globals.options.timed && !globals.lobby.settings.showTimerInUntimed)
    || clockPlayerIndex === undefined
  ) {
    return;
  }

  // Update the tooltip that appears when you hover over the current player's timer. Use absolute
  // values because time is measured in negative values in non-timed games.
  let time =
    Math.abs(globals.startingTurnTime)
    - Math.abs(globals.playerTimes[clockPlayerIndex]!);

  // We subtract the amount of time that passed since the beginning of the turn (as reported by the
  // server in the "clock" message). This is necessary since the client will not know how much time
  // has elapsed in the situation where they refresh the page in the middle of an ongoing turn.
  // "globals.timeTaken" will be 0 if the client was connected when the turn began.
  time -= Math.abs(globals.timeTaken);

  let content = "Time taken on this turn:<br /><strong>";
  content += millisecondsToClockString(time);
  content += "</strong>";
  tooltips.setContent("#tooltip-time-taken", content);
}
