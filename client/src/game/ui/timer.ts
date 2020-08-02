// Functions for timed games (and the timer that ticks up in untimed games)

import { millisecondsToClockString } from '../../misc';
import TimerDisplay from './controls/TimerDisplay';
import globals from './globals';
import { drawLayer } from './konvaHelpers';

export interface ClockData {
  times: number[];
  activePlayerIndex: number;
  timeTaken: number;
}

// This function handles the "clock" WebSocket command
// It is sent at the beginning of every turn
// to update the client about how much time each player has left
// It has the following data:
// {
//   times: [100, 200], // A list of the times for each player
//   activePlayerIndex: 0,
//   timeTaken: 500, // The amount of time that has elapsed since the turn began
// }
export const update = (data: ClockData) => {
  stop();

  // We don't need to update the timers if they are not showing
  if (globals.elements.timer1 === null || globals.elements.timer2 === null) {
    return;
  }

  // Record the data
  globals.playerTimes = data.times;
  globals.activePlayerIndex = data.activePlayerIndex;
  globals.timeTaken = data.timeTaken;

  // Keep track of what the active player's time was when they started their turn
  if (globals.options.timed) {
    globals.startingTurnTime = globals.playerTimes[data.activePlayerIndex];
  }

  // Mark the time that we updated the local player times
  globals.lastTimerUpdateTimeMS = new Date().getTime();

  // Update onscreen time displays
  if (globals.state.playing) {
    // The visibility of the first timer does not change during a game
    let time = globals.playerTimes[globals.state.metadata.ourPlayerIndex];
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking
      time *= -1;
    }
    globals.elements.timer1.setTimerText(millisecondsToClockString(time));
  }

  const ourTurn = (
    globals.state.playing
    && data.activePlayerIndex === globals.state.metadata.ourPlayerIndex
  );
  if (!ourTurn) {
    // Update the UI with the value of the timer for the active player
    let time = globals.playerTimes[data.activePlayerIndex];
    if (!globals.options.timed) {
      // Invert it to show how much time each player is taking
      time *= -1;
    }
    globals.elements.timer2.setTimerText(millisecondsToClockString(time));
    const activePlayerName = globals.state.metadata.playerNames[data.activePlayerIndex];
    globals.elements.timer2.setLabelText(activePlayerName);
  }

  globals.elements.timer2.visible(!ourTurn && data.activePlayerIndex !== -1);
  globals.layers.timer.batchDraw();

  // Update the timer tooltips for each player
  for (let i = 0; i < globals.playerTimes.length; i++) {
    setTickingDownTimeTooltip(i);
  }
  setTickingDownTimeCPTooltip();

  // The server will send an active value of -1 when the game is over
  if (data.activePlayerIndex === -1) {
    return;
  }

  // Start the local timer for the active player
  const activeTimer = (ourTurn ? globals.elements.timer1 : globals.elements.timer2);
  globals.timerID = window.setInterval(() => {
    setTickingDownTime(activeTimer);
    setTickingDownTimeTooltip(data.activePlayerIndex);
    setTickingDownTimeCPTooltip();
  }, 1000);
};

export const stop = () => {
  if (globals.timerID !== null) {
    window.clearInterval(globals.timerID);
    globals.timerID = null;
  }
};

const setTickingDownTime = (timer: TimerDisplay) => {
  // Calculate the elapsed time since the last timer update
  const now = new Date().getTime();
  const elapsedTime = now - globals.lastTimerUpdateTimeMS;
  globals.lastTimerUpdateTimeMS = now;
  if (elapsedTime < 0) {
    return;
  }

  // Update the time in local array to approximate server times
  globals.playerTimes[globals.activePlayerIndex] -= elapsedTime;
  if (globals.options.timed && globals.playerTimes[globals.activePlayerIndex] < 0) {
    // Don't let the timer go into negative values, or else it will mess up the display
    // (but in non-timed games, we want this to happen)
    globals.playerTimes[globals.activePlayerIndex] = 0;
  }

  let millisecondsLeft = globals.playerTimes[globals.activePlayerIndex];
  if (!globals.options.timed) {
    // Invert it to show how much time each player is taking
    millisecondsLeft *= -1;
  }
  const displayString = millisecondsToClockString(millisecondsLeft);

  // Update display
  timer.setTimerText(displayString);
  drawLayer(timer);

  // Play a sound to indicate that the current player is almost out of time
  // Do not play it more frequently than about once per second
  if (
    globals.options.timed
    && globals.lobby.settings.soundTimer
    && millisecondsLeft > 0 // Between 0 and 10 seconds
    && millisecondsLeft <= 10000
    && elapsedTime > 900
    && elapsedTime < 1100
    && !globals.state.pause.active
    && !globals.lobby.errorOccurred
  ) {
    globals.game!.sounds.play('tone');
  }
};

const setTickingDownTimeTooltip = (i: number) => {
  // This tooltip is disabled in speedrun mode
  if (globals.lobby.settings.speedrunMode || globals.options.speedrun) {
    return;
  }

  // Update the tooltip that appears when you hover over a player's name
  let time = globals.playerTimes[i];
  if (!globals.options.timed) {
    // Invert it to show how much time each player is taking
    time *= -1;
  }

  let content = 'Time ';
  if (globals.options.timed) {
    content += 'remaining';
  } else {
    content += 'taken';
  }
  content += ':<br /><strong>';
  content += millisecondsToClockString(time);
  content += '</strong>';
  $(`#tooltip-player-${i}`).tooltipster('instance').content(content);
};

const setTickingDownTimeCPTooltip = () => {
  // This tooltip is disabled in non-timed games
  if (!globals.options.timed && !globals.lobby.settings.showTimerInUntimed) {
    return;
  }

  // Update the tooltip that appears when you hover over the current player's timer
  let time = globals.startingTurnTime - globals.playerTimes[globals.activePlayerIndex];

  // We add the amount of time that passed since the beginning of the turn
  // (as reported by the server in the "clock" message)
  // This is necessary since the client will not know how much time has elapsed in the situation
  // where they refresh the page in the middle of an ongoing turn
  // "globals.timeTaken" will be 0 if the client was connected when the turn began
  time += globals.timeTaken;

  let content = 'Time taken on this turn:<br /><strong>';
  content += millisecondsToClockString(time);
  content += '</strong>';
  $('#tooltip-time-taken').tooltipster('instance').content(content);
};
