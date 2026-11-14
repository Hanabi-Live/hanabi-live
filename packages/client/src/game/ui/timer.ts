// The classic screen's timers (and the timer that ticks up in untimed games), and the tooltips that
// show the players' clocks. "../clock.ts" keeps the clocks.

import type { PlayerIndex } from "@hanabi-live/game";
import { millisecondsToClockString } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import type { ClockChange } from "../clock.ts";
import * as clock from "../clock.ts";
import { isOurSeat } from "../ourSeat.ts";
import { globals } from "./UiGlobals.ts";
import type { TimerDisplay } from "./controls/TimerDisplay.ts";
import { drawLayer } from "./konvaHelpers.ts";

/** Draws the clocks as they change. Returns the function that stops drawing them. */
export function init(): () => void {
  return clock.subscribe(onClockChanged);
}

function onClockChanged(change: ClockChange) {
  if (change.type === "tick") {
    drawTick(change.warning);
  } else {
    draw();
  }
}

/** Draws every clock, such as after the server sends them, or after the screen is drawn again. */
export function draw(): void {
  const { timer1, timer2 } = globals.elements;
  const activePlayerIndex = clock.getActivePlayerIndex();

  // The server sends no active player when the game is over.
  if (activePlayerIndex === undefined && globals.state.finished) {
    timer1?.hide();
    timer2?.hide();
    globals.layers.timer.batchDraw();
    return;
  }

  const ourTurn =
    globals.state.playing && isOurSeat(activePlayerIndex, globals.metadata);
  if (timer1 !== undefined && timer2 !== undefined) {
    updateTimerDisplays(timer1, timer2, activePlayerIndex, ourTurn);
  }

  // Update the timer tooltips for each player.
  for (const i of clock.getPlayerTimes().keys()) {
    setPlayerNameTooltip(i as PlayerIndex);
  }
  setCurrentPlayerTooltip();
}

/** Draws the active player's clock after it counted. */
function drawTick(warning: boolean) {
  const activePlayerIndex = clock.getActivePlayerIndex();
  if (activePlayerIndex === undefined) {
    return;
  }

  // The timers are not drawn in untimed games unless the player enabled them.
  const ourTurn =
    globals.state.playing && isOurSeat(activePlayerIndex, globals.metadata);
  const timer = ourTurn ? globals.elements.timer1 : globals.elements.timer2;
  if (timer !== undefined) {
    timer.setTimerText(
      millisecondsToClockString(clock.getPlayerTime(activePlayerIndex)!),
    );
    drawLayer(timer);
    if (warning) {
      timer.toggleWarningFlash();
    }
  }

  setPlayerNameTooltip(activePlayerIndex);
  setCurrentPlayerTooltip();
  globals.elements.deck?.updateDeckTooltip();
}

function updateTimerDisplays(
  timer1: TimerDisplay,
  timer2: TimerDisplay,
  activePlayerIndex: PlayerIndex | undefined,
  ourTurn: boolean,
) {
  if (globals.state.playing) {
    // The visibility of the first timer does not change during a game.
    const { ourPlayerIndex } = globals.metadata;
    assertDefined(ourPlayerIndex, "A player has no seat.");
    const time = clock.getPlayerTime(ourPlayerIndex);
    if (time !== undefined) {
      timer1.setTimerText(millisecondsToClockString(time));
    }
  }

  if (!ourTurn && activePlayerIndex !== undefined) {
    // Update the UI with the value of the timer for the active player.
    timer2.setTimerText(
      millisecondsToClockString(clock.getPlayerTime(activePlayerIndex)!),
    );

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

/** Update the tooltip that appears when you hover over a player's name. */
function setPlayerNameTooltip(playerIndex: PlayerIndex) {
  // This tooltip is disabled in speedrun mode.
  if (
    store.getState().session.settings.speedrunFeatures
    || globals.options.speedrun
  ) {
    return;
  }

  const playerTime = clock.getPlayerTime(playerIndex);
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

/** Update the tooltip that appears when you hover over the current player's timer. */
function setCurrentPlayerTooltip() {
  // This tooltip is disabled in non-timed games.
  const turnTime = clock.getTurnTime();
  if (
    (globals.options.timeControl === undefined
      && !store.getState().session.settings.showTimerInUntimed)
    || turnTime === undefined
  ) {
    return;
  }

  let content = "Time taken on this turn:<br /><strong>";
  content += millisecondsToClockString(turnTime);
  content += "</strong>";
  tooltips.setContent("time-taken", content);
}
