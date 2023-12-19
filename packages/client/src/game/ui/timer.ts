// Functions for timed games (and the timer that ticks up in untimed games).

import type { PlayerIndex } from "@hanabi/game";
import * as tooltips from "../../tooltips";
import { millisecondsToClockString } from "../rules/text";
import { SoundType } from "../types/SoundType";
import { globals } from "./UIGlobals";
import type { TimerDisplay } from "./controls/TimerDisplay";
import { drawLayer } from "./konvaHelpers";

export interface ClockData {
  times: number[];

  /** -1 if the game just ended. */
  activePlayerIndex: PlayerIndex | -1;

  timeTaken: number;
}

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
export function update(data: ClockData): void {
  stop();

  // We do not need to update the timers if they are not showing.
  if (globals.elements.timer1 === null || globals.elements.timer2 === null) {
    return;
  }

  // We do not need to update the timers if the game is paused. (The server will send another
  // "clock" message when the game becomes unpaused.)
  if (globals.state.pause.active) {
    return;
  }

  // Record the data
  globals.playerTimes = data.times;
  globals.activePlayerIndex = data.activePlayerIndex;
  globals.timeTaken = data.timeTaken;

  // Keep track of what the active player's time was when they started their turn.
  globals.startingTurnTime = globals.playerTimes[data.activePlayerIndex]!;

  // Mark the time that we updated the local player times.
  globals.lastTimerUpdateTimeMS = Date.now();

  // Update onscreen time displays.
  if (globals.state.playing) {
    // The visibility of the first timer does not change during a game.
    let time = globals.playerTimes[globals.metadata.ourPlayerIndex]!;
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking.
      time *= -1;
    }

    const text = millisecondsToClockString(time);
    globals.elements.timer1.setTimerText(text);
  }

  const ourTurn =
    globals.state.playing &&
    data.activePlayerIndex === globals.metadata.ourPlayerIndex;
  if (!ourTurn) {
    // Update the UI with the value of the timer for the active player.
    let time = globals.playerTimes[data.activePlayerIndex]!;
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking.
      time *= -1;
    }

    const text = millisecondsToClockString(time);
    globals.elements.timer2.setTimerText(text);

    if (data.activePlayerIndex !== -1) {
      const activePlayerName =
        globals.metadata.playerNames[data.activePlayerIndex];
      if (activePlayerName !== undefined) {
        globals.elements.timer2.setLabelText(activePlayerName);
      }
    }
  }

  globals.elements.timer2.visible(!ourTurn && data.activePlayerIndex !== -1);
  globals.layers.timer.batchDraw();

  // Update the timer tooltips for each player.
  for (const i of globals.playerTimes.keys()) {
    const playerIndex = i as PlayerIndex;
    setTickingDownTimeTooltip(playerIndex);
  }
  setTickingDownTimeCPTooltip();

  // The server will send an active player index of -1 when the game is over.
  if (data.activePlayerIndex === -1) {
    return;
  }

  // Reset both timers to black background, if player was running out of time.
  globals.elements.timer1.oval.fill("black").opacity(0.2);
  globals.elements.timer2.oval.fill("black").opacity(0.2);

  // Start the local timer for the active player.
  const activeTimer = ourTurn
    ? globals.elements.timer1
    : globals.elements.timer2;
  globals.timerID = window.setInterval(() => {
    setTickingDownTime(activeTimer);
    setTickingDownTimeTooltip(data.activePlayerIndex);
    setTickingDownTimeCPTooltip();
  }, 1000);
}

export function stop(): void {
  if (globals.timerID !== null) {
    window.clearInterval(globals.timerID);
    globals.timerID = null;
  }
}

function setTickingDownTime(timer: TimerDisplay) {
  // Calculate the elapsed time since the last timer update.
  const now = Date.now();
  const elapsedTime = now - globals.lastTimerUpdateTimeMS;
  globals.lastTimerUpdateTimeMS = now;
  if (elapsedTime < 0) {
    return;
  }

  // Update the time in local array to approximate server times.
  globals.playerTimes[globals.activePlayerIndex] -= elapsedTime;
  if (
    globals.options.timed &&
    globals.playerTimes[globals.activePlayerIndex]! < 0
  ) {
    // Do not let the timer go into negative values, or else it will mess up the display. (But in
    // non-timed games, we want this to happen.)
    globals.playerTimes[globals.activePlayerIndex] = 0;
  }

  let millisecondsLeft = globals.playerTimes[globals.activePlayerIndex]!;
  if (!globals.options.timed) {
    // Invert it to show how much time each player is taking.
    millisecondsLeft *= -1;
  }
  const text = millisecondsToClockString(millisecondsLeft);
  timer.setTimerText(text);
  drawLayer(timer);

  // Play a sound to indicate that the current player is almost out of time. Do not play it more
  // frequently than about once per second.
  if (
    globals.options.timed &&
    globals.lobby.settings.soundTimer &&
    millisecondsLeft > 0 && // Between 0 and 10 seconds
    millisecondsLeft <= 10_000 &&
    elapsedTime > 900 &&
    elapsedTime < 1100 &&
    !globals.state.pause.active &&
    !globals.lobby.errorOccurred
  ) {
    timer.oval.opacity(timer.oval.fill() === "black" ? 0.7 : 0.2);
    timer.oval.fill(timer.oval.fill() === "black" ? "red" : "black");
    globals.game!.sounds.play(SoundType.Tone);
  }
}

/** Update the tooltip that appears when you hover over a player's name. */
function setTickingDownTimeTooltip(playerIndex: PlayerIndex | -1) {
  if (playerIndex === -1) {
    return;
  }

  // This tooltip is disabled in speedrun mode.
  if (globals.lobby.settings.speedrunMode || globals.options.speedrun) {
    return;
  }

  const playerTime = globals.playerTimes[playerIndex];
  if (playerTime === undefined) {
    return;
  }

  // Invert it to show how much time each player is taking.
  const milliseconds = globals.options.timed ? playerTime : playerTime * -1;

  let content = "Time ";
  content += globals.options.timed ? "remaining" : "taken";
  content += ":<br /><strong>";
  content += millisecondsToClockString(milliseconds);
  content += "</strong>";
  tooltips.setInstanceContent(`#tooltip-player-${playerIndex}`, content);
}

function setTickingDownTimeCPTooltip() {
  // This tooltip is disabled in non-timed games.
  if (!globals.options.timed && !globals.lobby.settings.showTimerInUntimed) {
    return;
  }

  // Update the tooltip that appears when you hover over the current player's timer. Use absolute
  // values because time is measured in negative values in non-timed games.
  let time =
    Math.abs(globals.startingTurnTime) -
    Math.abs(globals.playerTimes[globals.activePlayerIndex]!);

  // We subtract the amount of time that passed since the beginning of the turn (as reported by the
  // server in the "clock" message). This is necessary since the client will not know how much time
  // has elapsed in the situation where they refresh the page in the middle of an ongoing turn.
  // "globals.timeTaken" will be 0 if the client was connected when the turn began.
  time -= Math.abs(globals.timeTaken);

  let content = "Time taken on this turn:<br /><strong>";
  content += millisecondsToClockString(time);
  content += "</strong>";
  tooltips.setInstanceContent("#tooltip-time-taken", content);
}
