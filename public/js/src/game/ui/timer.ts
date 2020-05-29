// Functions for timed games (and the timer that ticks up in untimed games)

// Imports
import * as misc from '../../misc';
import ClockData from './ClockData';
import globals from './globals';
import TimerDisplay from './TimerDisplay';

// This function handles the "clock" WebSocket command
// It is sent at the beginning of every turn
// to update the client about how much time each player has left
// It has the following data:
// {
//   times: [100, 200], // A list of the times for each player
//   active: 0, // The index of the active player
//   timeTaken: 500, // The amount of time that has elasped since the turn began
// }
export const update = (data: ClockData) => {
  stop();

  // We don't need to update the timers if they are not showing
  if (globals.elements.timer1 === null || globals.elements.timer2 === null) {
    return;
  }

  // Record the data
  globals.playerTimes = data.times;
  globals.activeIndex = data.active;
  globals.timeTaken = data.timeTaken;

  // Keep track of what the active player's time was when they started their turn
  if (globals.timed) {
    globals.startingTurnTime = globals.playerTimes[globals.activeIndex];
  }

  // Mark the time that we updated the local player times
  globals.lastTimerUpdateTimeMS = new Date().getTime();

  // Update onscreen time displays
  if (!globals.spectating) {
    // The visibilty of the first timer does not change during a game
    let time = globals.playerTimes[globals.playerUs];
    if (!globals.timed) {
      // Invert it to show how much time each player is taking
      time *= -1;
    }
    globals.elements.timer1.setTimerText(misc.millisecondsToClockString(time));
  }

  const ourTurn = globals.activeIndex === globals.playerUs && !globals.spectating;
  if (!ourTurn) {
    // Update the UI with the value of the timer for the active player
    let time = globals.playerTimes[globals.activeIndex];
    if (!globals.timed) {
      // Invert it to show how much time each player is taking
      time *= -1;
    }
    globals.elements.timer2.setTimerText(misc.millisecondsToClockString(time));
    globals.elements.timer2.setLabelText(globals.playerNames[globals.activeIndex]);
  }

  globals.elements.timer2.visible(!ourTurn && globals.activeIndex !== -1);
  globals.layers.timer.batchDraw();

  // Update the timer tooltips for each player
  for (let i = 0; i < globals.playerTimes.length; i++) {
    setTickingDownTimeTooltip(i);
  }
  setTickingDownTimeCPTooltip();

  // The server will send an active value of -1 when the game is over
  if (globals.activeIndex === -1) {
    return;
  }

  // Start the local timer for the active player
  const activeTimer = (ourTurn ? globals.elements.timer1 : globals.elements.timer2);
  globals.timerID = window.setInterval(() => {
    setTickingDownTime(activeTimer);
    setTickingDownTimeTooltip(globals.activeIndex);
    setTickingDownTimeCPTooltip();
  }, 1000);
};

export const stop = () => {
  if (globals.timerID !== null) {
    window.clearInterval(globals.timerID);
    globals.timerID = null;
  }
};

function setTickingDownTime(timer: TimerDisplay) {
  // Calculate the elapsed time since the last timer update
  const now = new Date().getTime();
  const elapsedTime = now - globals.lastTimerUpdateTimeMS;
  globals.lastTimerUpdateTimeMS = now;
  if (elapsedTime < 0) {
    return;
  }

  // Update the time in local array to approximate server times
  globals.playerTimes[globals.activeIndex] -= elapsedTime;
  if (globals.timed && globals.playerTimes[globals.activeIndex] < 0) {
    // Don't let the timer go into negative values, or else it will mess up the display
    // (but in non-timed games, we want this to happen)
    globals.playerTimes[globals.activeIndex] = 0;
  }

  let millisecondsLeft = globals.playerTimes[globals.activeIndex];
  if (!globals.timed) {
    // Invert it to show how much time each player is taking
    millisecondsLeft *= -1;
  }
  const displayString = misc.millisecondsToClockString(millisecondsLeft);

  // Update display
  timer.setTimerText(displayString);
  const layer = timer.getLayer();
  if (layer) {
    layer.batchDraw();
  }

  // Play a sound to indicate that the current player is almost out of time
  // Do not play it more frequently than about once per second
  if (
    globals.timed
    && globals.lobby.settings.soundTimer
    && millisecondsLeft > 0 // Between 0 and 10 seconds
    && millisecondsLeft <= 10000
    && elapsedTime > 900
    && elapsedTime < 1100
    && !globals.paused
    && !globals.lobby.errorOccured
  ) {
    globals.game!.sounds.play('tone');
  }
}

function setTickingDownTimeTooltip(i: number) {
  // This tooltip is disabled in speedrun mode
  if (globals.lobby.settings.speedrunMode || globals.speedrun) {
    return;
  }

  // Update the tooltip that appears when you hover over a player's name
  let time = globals.playerTimes[i];
  if (!globals.timed) {
    // Invert it to show how much time each player is taking
    time *= -1;
  }

  let content = 'Time ';
  if (globals.timed) {
    content += 'remaining';
  } else {
    content += 'taken';
  }
  content += ':<br /><strong>';
  content += misc.millisecondsToClockString(time);
  content += '</strong>';
  $(`#tooltip-player-${i}`).tooltipster('instance').content(content);
}

const setTickingDownTimeCPTooltip = () => {
  // This tooltip is disabled in non-timed games
  if (!globals.timed) {
    return;
  }

  // Update the tooltip that appears when you hover over the current player's timer
  let time = globals.startingTurnTime - globals.playerTimes[globals.activeIndex];

  // We add the amount of time that passed since the beginning of the turn
  // (as reported by the server in the "clock" message)
  // This is necessary since the client will not know how much time has elapsed in the situation
  // where they refresh the page in the middle of an ongoing turn
  // "globals.timeTaken" will be 0 if the client was connected when the turn began
  time += globals.timeTaken;

  let content = 'Time taken on this turn:<br /><strong>';
  content += misc.millisecondsToClockString(time);
  content += '</strong>';
  $('#tooltip-time-taken').tooltipster('instance').content(content);
};
