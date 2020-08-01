// Functions for progressing forward and backward through time

import Konva from 'konva';
import * as arrows from './arrows';
import Shuttle from './controls/Shuttle';
import globals from './globals';
import { animate } from './konvaHelpers';

// ---------------------
// Main replay functions
// ---------------------

export const enter = (customSegment?: number) => {
  if (globals.state.replay.active) {
    return;
  }

  // By default, use the final segment of the ongoing game, or 0
  const segment = customSegment ?? globals.state.ongoingGame.turn.segment ?? 0;

  globals.store!.dispatch({
    type: 'replayEnter',
    segment,
  });
};

export const exit = () => {
  if (!globals.state.replay.active) {
    return;
  }

  // Always animate fast if we are exiting a replay, even if we are only jumping to an adjacent turn
  globals.store!.dispatch({
    type: 'replayExit',
  });
};

export const getCurrentReplaySegment = () => {
  const finalSegment = globals.state.ongoingGame.turn.segment!;
  return globals.state.replay.active ? globals.state.replay.segment : finalSegment;
};

export const goToSegment = (
  segment: number,
  breakFree: boolean = false,
  force: boolean = false,
) => {
  const finalSegment = globals.state.ongoingGame.turn.segment!;
  const currentSegment = getCurrentReplaySegment();

  // Validate the target segment
  // The target must be between 0 and the final replay segment
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
  const newSegment = clamp(segment, 0, finalSegment);
  if (currentSegment === newSegment) {
    return;
  }

  // Disable replay navigation while we are in a hypothetical
  // (hypothetical navigation functions will set "force" equal to true)
  if (globals.state.replay.hypothetical !== null && !force) {
    return;
  }

  // Enter the replay, if we are not already
  enter(newSegment);

  // By default, most replay navigation actions should "break free" from the shared segments to
  // allow users to go off on their own side adventure through the game
  // However, if we are navigating to a new segment as the shared replay leader,
  // do not disable shared segments
  if (
    breakFree
    && globals.state.replay.shared !== null
    && globals.state.replay.shared.useSharedSegments
    && !globals.state.replay.shared.amLeader
  ) {
    globals.store!.dispatch({
      type: 'replayUseSharedSegments',
      useSharedSegments: false,
    });
  }

  globals.store!.dispatch({
    type: 'replaySegment',
    segment: newSegment,
  });

  if (
    globals.state.replay.shared !== null
    && globals.state.replay.shared.amLeader
    && globals.state.replay.shared.useSharedSegments
  ) {
    globals.store!.dispatch({
      type: 'replaySharedSegment',
      segment: newSegment,
    });
  }
};

export const goToSegmentAndIndicateCard = (segment: number, order: number) => {
  goToSegment(segment, true);

  // We indicate the card to make it easier to see
  arrows.hideAll(); // We hide all the arrows first to ensure that the arrow is always shown
  arrows.toggle(globals.deck[order]);
};

// ---------------------------
// Replay navigation functions
// ---------------------------

export const back = (breakFree: boolean = true) => {
  goToSegment(getCurrentReplaySegment() - 1, breakFree);
};

export const forward = () => {
  goToSegment(getCurrentReplaySegment() + 1, true);
};

export const backRound = () => {
  goToSegment(getCurrentReplaySegment() - globals.options.numPlayers, true);
};

export const forwardRound = () => {
  goToSegment(getCurrentReplaySegment() + globals.options.numPlayers, true);
};

export const backFull = () => {
  goToSegment(0, true);
};

export const forwardFull = () => {
  const finalSegment = globals.state.ongoingGame.turn.segment!;
  goToSegment(finalSegment, true);
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

// Gets the current segment from an X position relative to a maximum width
const segmentFromBarPosition = (x: number, w: number) => {
  const finalSegment = globals.state.ongoingGame.turn.segment!;
  const step = w / finalSegment;
  return Math.floor((x + (step / 2)) / step);
};

// Called when a position in the bar is clicked
export function barClick(this: Konva.Rect) {
  const rectX = globals.stage.getPointerPosition().x - this.getAbsolutePosition().x;
  const w = globals.elements.replayBar!.width();
  goToSegment(segmentFromBarPosition(rectX, w), true);
}

// Called when a position in the bar is clicked
export function barScroll(this: Konva.Rect, e: Konva.KonvaEventObject<WheelEvent>) {
  let delta = 0;
  if (e.evt.deltaY > 0) {
    delta = 1;
  } else if (e.evt.deltaY < 0) {
    delta = -1;
  } else {
    return;
  }

  goToSegment(getCurrentReplaySegment() + delta, true);
}

// Restricts the positions of the replay shuttle
// Given a desired position, returns the allowed position closest to it
export function shuttleDragBound(this: Konva.Rect, pos: Konva.Vector2d) {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

  const min = globals.elements.replayBar!.getAbsolutePosition().x + (this.width() * 0.5);
  const w = globals.elements.replayBar!.width() - this.width();

  const shuttleX = clamp(pos.x - min, 0, w);
  const segment = segmentFromBarPosition(shuttleX, w);

  const finalSegment = globals.state.ongoingGame.turn.segment!;
  const step = w / finalSegment;

  return {
    x: min + (segment * step),
    y: this.getAbsolutePosition().y,
  };
}

// Called when the shuttle moves. The position is guaranteed to be valid by shuttleDragBound
export function shuttleDragMove(this: Konva.Rect) {
  const min = globals.elements.replayBar!.getAbsolutePosition().x + (this.width() * 0.5);
  const w = globals.elements.replayBar!.width() - this.width();
  const newSegment = segmentFromBarPosition(this.getAbsolutePosition().x - min, w);
  goToSegment(newSegment, true);
}

const positionReplayShuttle = (
  shuttle: Shuttle,
  targetSegment: number,
  smaller: boolean,
  fast: boolean,
) => {
  let finalSegment = globals.state.ongoingGame.turn.segment;
  if (
    finalSegment === null // The final segment is null during initialization
    || finalSegment === 0 // The final segment is 0 before a move is made
  ) {
    // For the purposes of the replay shuttle calculation,
    // we need to assume that there are at least two possible locations
    finalSegment = 1;
  }
  const winH = globals.stage.height();
  const sliderW = globals.elements.replayBar!.width() - shuttle.width();
  const x = (
    globals.elements.replayBar!.x()
    + (sliderW / finalSegment * targetSegment)
    + (shuttle.width() / 2)
  );
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
  }, true, fast);
};

export const adjustShuttles = (fast: boolean) => {
  // If the two shuttles are overlapping, then make the normal shuttle a little bit smaller
  let smaller = false;
  if (
    globals.state.replay.shared !== null
    && !globals.state.replay.shared.useSharedSegments
    && globals.state.replay.segment === globals.state.replay.shared.segment
  ) {
    smaller = true;
  }

  const draggingShuttle = globals.elements.replayShuttle!.isDragging();

  // Adjust the replay shuttle along the bar based on the current segment
  // If it is smaller, we need to nudge it to the right a bit in order to center it
  positionReplayShuttle(
    globals.elements.replayShuttle!,
    globals.state.replay.segment,
    smaller,
    fast || draggingShuttle,
  );

  // Adjust the shared replay shuttle along the bar based on the shared segment
  globals.elements.replayShuttleShared!.visible(globals.state.replay.shared !== null);
  if (globals.state.replay.shared !== null) {
    positionReplayShuttle(
      globals.elements.replayShuttleShared!,
      globals.state.replay.shared.segment,
      false,
      fast || (
        draggingShuttle
        && globals.state.replay.shared.segment === globals.state.replay.segment
      ),
    );
  }
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

  goToSegment(targetTurn, true);
};

// --------------------------------
// The "Toggle Shared Turns" button
// --------------------------------

export const toggleSharedSegments = () => {
  if (globals.state.replay.shared === null) {
    return;
  }

  globals.store!.dispatch({
    type: 'replayUseSharedSegments',
    useSharedSegments: !globals.state.replay.shared.useSharedSegments,
  });
};
