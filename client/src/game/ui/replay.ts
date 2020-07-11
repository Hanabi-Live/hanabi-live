// Functions for progressing forward and backward through time

import Konva from 'konva';
import * as deck from '../rules/deck';
import ReplayActionType from '../types/ReplayActionType';
import action from './action';
import Shuttle from './controls/Shuttle';
import globals from './globals';
import { animate } from './konvaHelpers';
import statusCheckOnAllCards from './statusCheckOnAllCards';
import * as tooltips from './tooltips';
import * as turn from './turn';

// ---------------------
// Main replay functions
// ---------------------

export const enter = () => {
  if (globals.hypothetical) {
    // Don't allow replay navigation while in a hypothetical
    return;
  }
  if (globals.replayMax === 0) {
    // No actions have been taken yet, so we cannot enter a replay
    return;
  }
  if (globals.inReplay) {
    return;
  }
  globals.inReplay = true;

  // Start by putting us at the end of the replay (the current game state)
  globals.replayPos = globals.replayLog.length;
  globals.replayTurn = globals.replayMax;

  // TEMP: eventually, move code from this file to reducers and observers
  globals.store!.dispatch({ type: 'startReplay', turn: globals.replayTurn });

  // However, if the game just ended,
  // we want to go to the turn before the miscellaneous data sent at the end of the game
  if (globals.gameOver) {
    globals.replayPos = globals.finalReplayPos;
    globals.replayTurn = globals.finalReplayTurn;
  }

  // Hide the UI elements that overlap with the replay area
  turn.hideClueUIAndDisableDragging();

  // Next, show the replay area and initialize some UI elements
  globals.elements.replayArea!.show();
  adjustShuttles(true); // We want it to immediately snap to the end
  setVisibleButtons();
  globals.layers.UI.batchDraw();
};

export const exit = () => {
  if (!globals.inReplay) {
    return;
  }

  goto(globals.replayMax, true);
  globals.inReplay = false;
  globals.elements.replayArea!.hide();

  // TEMP: eventually, move code from this file to reducers and observers
  globals.store!.dispatch({ type: 'endReplay' });

  if (globals.ourTurn) {
    turn.showClueUIAndEnableDragging();
  }
  if (globals.queuedAction !== null) {
    globals.elements.currentPlayerArea!.hide();
    globals.elements.premoveCancelButton!.show();
  }

  for (let i = 0; i <= globals.indexOfLastDrawnCard; i++) {
    globals.deck[i].setBareImage();
  }

  globals.layers.UI.batchDraw();
  globals.layers.card.batchDraw();
};

export const goto = (target: number, fast: boolean, force?: boolean) => {
  if (globals.hypothetical && !force) {
    // Don't allow the user to "break free" in a hypothetical
    // (e.g. by clicking on a clue entry in the top-right hand corner)
    // "force" will be set to true if this function is being called from hypothetical functions
    return;
  }

  // Validate function arguments: target must be between 0 and replayMax
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
  const targetTurn = clamp(target, 0, globals.replayMax);
  if (targetTurn === globals.replayTurn) {
    // TEMP: eventually, move code from this file to reducers and observers
    globals.store!.dispatch({ type: 'goToTurn', turn: globals.replayTurn });

    return;
  }

  const rewind = targetTurn < globals.replayTurn;

  if (
    globals.sharedReplay
    && globals.amSharedReplayLeader
    && globals.useSharedTurns
  ) {
    shareCurrentTurn(targetTurn);
  }

  globals.replayTurn = targetTurn;

  setVisibleButtons();
  adjustShuttles(false);
  if (fast) {
    globals.animateFast = true;
  }

  if (rewind) {
    reset();
    globals.replayPos = 0;
  }

  // Iterate over the replay and stop at the current turn or at the end, whichever comes first
  while (true) {
    const msg = globals.replayLog[globals.replayPos];
    globals.replayPos += 1;

    // Stop at the end of the replay
    if (!msg) {
      break;
    }

    // Re-process all game actions; this will correctly position cards and text
    action(msg);

    // Stop if you're at the current turn
    if (msg.type === 'turn' && msg.num === globals.replayTurn) {
      break;
    }
  }

  // TEMP: eventually, move code from this file to reducers and observers
  globals.store!.dispatch({ type: 'goToTurn', turn: globals.replayTurn });

  // Automatically close any tooltips and disable all Empathy when we jump to a particular turn
  // Without this, we would observe glitchy behavior
  tooltips.resetActiveHover();

  if (!globals.loading) {
    globals.animateFast = false;
    statusCheckOnAllCards();
    globals.layers.card.batchDraw();
    globals.layers.UI.batchDraw();
    globals.layers.arrow.batchDraw();
    globals.layers.UI2.batchDraw();
  }
};

const setVisibleButtons = () => {
  // If we are on the first turn, disable the rewind replay buttons
  globals.elements.replayBackFullButton!.setEnabled(globals.replayTurn !== 0);
  globals.elements.replayBackButton!.setEnabled(globals.replayTurn !== 0);

  // If we are on the last turn, disable the forward replay buttons
  globals.elements.replayForwardButton!.setEnabled(globals.replayTurn !== globals.replayMax);
  globals.elements.replayForwardFullButton!.setEnabled(globals.replayTurn !== globals.replayMax);
};

const reset = () => {
  // Reset some game state variables
  globals.turn = 0;
  globals.deckSize = deck.totalCards(globals.variant);

  // Reset various UI elements
  globals.postAnimationLayout = null;
  globals.elements.deck!.setCount(globals.deckSize);

  // Reset the strikes
  for (const strikeX of globals.elements.strikeXs) {
    if (strikeX.tween !== null) {
      strikeX.tween.destroy();
      strikeX.tween = null;
    }
    strikeX.opacity(0);
    strikeX.setFaded();
  }
};

// -----------------------------
// The 4 replay button functions
// -----------------------------

export const backFull = () => {
  checkDisableSharedTurns();
  goto(0, true);
};

export const back = () => {
  checkDisableSharedTurns();
  goto(globals.replayTurn - 1, false);
};

export const forward = () => {
  checkDisableSharedTurns();
  goto(globals.replayTurn + 1, false);
};

export const forwardFull = () => {
  checkDisableSharedTurns();
  goto(globals.replayMax, true);
};

// ----------------------
// Extra replay functions
// ----------------------

export const backRound = () => {
  checkDisableSharedTurns();
  goto(globals.replayTurn - globals.playerNames.length, true);
};

export const forwardRound = () => {
  checkDisableSharedTurns();
  goto(globals.replayTurn + globals.playerNames.length, false);
};

// ------------------------
// The "Exit Replay" button
// ------------------------

export const exitButton = () => {
  // Mark the time that the user clicked the "Exit Replay" button
  // (so that we can avoid an accidental "Give Clue" double-click)
  globals.UIClickTime = Date.now();

  exit();
};

// ------------------
// The replay shuttle
// ------------------

export function barClick(this: Konva.Rect) {
  const rectX = globals.stage.getPointerPosition().x - this.getAbsolutePosition().x;
  const w = this.width();
  const step = w / globals.replayMax;
  const newTurn = Math.floor((rectX + (step / 2)) / step);
  if (newTurn !== globals.replayTurn) {
    checkDisableSharedTurns();
    goto(newTurn, true);
  }
}

export function barDrag(this: Konva.Rect, pos: Konva.Vector2d) {
  const min = globals.elements.replayBar!.getAbsolutePosition().x + (this.width() * 0.5);
  const w = globals.elements.replayBar!.width() - this.width();
  let shuttleX = pos.x - min;
  const shuttleY = this.getAbsolutePosition().y;
  if (shuttleX < 0) {
    shuttleX = 0;
  }
  if (shuttleX > w) {
    shuttleX = w;
  }
  const step = w / globals.replayMax;
  const newTurn = Math.floor((shuttleX + (step / 2)) / step);
  if (newTurn !== globals.replayTurn) {
    checkDisableSharedTurns();
    goto(newTurn, true);
  }
  shuttleX = newTurn * step;
  return {
    x: min + shuttleX,
    y: shuttleY,
  };
}

const positionReplayShuttle = (
  shuttle: Shuttle,
  target: number,
  smaller: boolean,
  fast: boolean,
) => {
  // During initialization, the turn will be -1 and the maximum number of replay turns will be 0
  // Account for this and provide sane defaults
  const targetTurn = (target === -1) ? 0 : target;
  const max = (globals.replayMax === 0) ? 1 : globals.replayMax;

  const winH = globals.stage.height();
  const sliderW = globals.elements.replayBar!.width() - shuttle.width();
  const x = globals.elements.replayBar!.x() + (sliderW / max * targetTurn) + (shuttle.width() / 2);
  let y = globals.elements.replayBar!.y() + (shuttle.height() * 0.55);
  if (smaller) {
    y -= 0.003 * winH;
  }
  const scale = smaller ? 0.7 : 1;
  animate(shuttle, {
    duration: 0.25,
    x,
    y,
    scale,
    easing: Konva.Easings.EaseOut,
  }, fast, true);
};

export const adjustShuttles = (fast: boolean) => {
  // If the shuttles are overlapping, then make the normal shuttle a little bit smaller
  let smaller = false;
  if (!globals.useSharedTurns && globals.replayTurn === globals.sharedReplayTurn) {
    smaller = true;
  }

  // Adjust the shuttles along the X axis based on the current turn
  // If it is smaller, we need to nudge it to the right a bit in order to center it
  positionReplayShuttle(
    globals.elements.replayShuttleShared!,
    globals.sharedReplayTurn,
    false,
    fast,
  );
  positionReplayShuttle(
    globals.elements.replayShuttle!,
    globals.replayTurn,
    smaller,
    fast,
  );
};

// -----------------------------
// Right-clicking the turn count
// -----------------------------

export const promptTurn = () => {
  const turnString = window.prompt('Which turn do you want to go to?');
  if (turnString === null) {
    return;
  }
  let targetTurn = parseInt(turnString, 10);
  if (Number.isNaN(targetTurn)) {
    return;
  }

  // We need to decrement the turn because
  // the turn shown to the user is always one greater than the real turn
  targetTurn -= 1;

  if (globals.replay) {
    checkDisableSharedTurns();
  } else {
    enter();
  }
  goto(targetTurn, true);
};

// --------------------------------
// The "Toggle Shared Turns" button
// --------------------------------

export const toggleSharedTurns = () => {
  globals.useSharedTurns = !globals.useSharedTurns;

  globals.elements.pauseSharedTurnsButton!.visible(globals.useSharedTurns);
  globals.elements.useSharedTurnsButton!.visible(!globals.useSharedTurns);
  globals.elements.replayShuttleShared!.visible(!globals.useSharedTurns);

  if (globals.useSharedTurns) {
    if (globals.amSharedReplayLeader) {
      shareCurrentTurn(globals.replayTurn);
    } else {
      goto(globals.sharedReplayTurn, true);
    }
  }

  // We need to adjust the shuttles in the case where
  // the normal shuttle is underneath the shared replay shuttle
  // and we need to make it bigger/smaller
  adjustShuttles(false);
};

// Navigating as a follower in a shared replay disables replay actions
export const checkDisableSharedTurns = () => {
  if (globals.hypothetical) {
    // Don't allow the user to "break free" in a hypothetical
    return;
  }
  if (
    globals.replay
    && globals.sharedReplay
    && !globals.amSharedReplayLeader
    && globals.useSharedTurns
  ) {
    // Replay actions are currently enabled, so disable them
    toggleSharedTurns();
  }
};

const shareCurrentTurn = (targetTurn: number) => {
  if (globals.sharedReplayTurn === targetTurn) {
    return;
  }

  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.Turn,
    turn: targetTurn,
  });
  globals.sharedReplayTurn = targetTurn;
  adjustShuttles(false);
};

export const clueLogClickHandler = (targetTurn: number) => {
  if (globals.replay) {
    checkDisableSharedTurns();
  } else {
    enter();
  }
  goto(targetTurn + 1, true);
};
