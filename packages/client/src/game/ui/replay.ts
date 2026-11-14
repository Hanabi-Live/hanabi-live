// Functions for progressing forward and backward through time.

import type { CardOrder } from "@hanabi-live/game";
import { clamp, parseIntSafe } from "complete-common";
import Konva from "konva";
import { showPrompt } from "../../modals.ts";
import { store } from "../../store.ts";
import { gameUpdated } from "../gameSlice.ts";
import type { State } from "../types/State.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import type { Shuttle } from "./controls/Shuttle.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import { animate } from "./konvaHelpers.ts";

/** How long a replay shuttle takes to slide to a new segment. */
const SHUTTLE_ANIMATION_SECONDS = 0.25;

/**
 * How big the replay shuttle is when it is on the same segment as the shared replay shuttle, so
 * that both stay visible.
 */
const OVERLAPPING_SHUTTLE_SCALE = 0.7;

// ---------------------
// Main replay functions
// ---------------------

/**
 * The last segment that the replay controls go to. A finished game ends with a segment that only
 * adds the players' times to the action log. The New UI has no action log, so that segment looks
 * the same as the one before it, and the New UI stops one segment earlier.
 */
export function getLastSegment(
  state: State = globals.state,
  newUi: boolean = store.getState().newUi.shown,
): number {
  const finalSegment = state.ongoingGame.turn.segment ?? 0;
  return newUi && state.replay.actions.at(-1)?.type === "playerTimes"
    ? finalSegment - 1
    : finalSegment;
}

export function enter(customSegment?: number): void {
  if (globals.state.replay.segment !== undefined) {
    return;
  }

  // By default, use the final segment of the ongoing game, or 0
  const segment = customSegment ?? getLastSegment();

  store.dispatch(
    gameUpdated({
      type: "replayEnter",
      segment,
    }),
  );
}

export function exit(): void {
  if (globals.state.replay.segment === undefined) {
    return;
  }

  // Always animate fast if we are exiting a replay, even if we are only jumping to an adjacent
  // turn.
  store.dispatch(gameUpdated({ type: "replayExit" }));
}

/** Spoiler-free reviews hide what happens later in the game. */
export function isSpoilerFree(): boolean {
  return globals.state.replay.shared?.spoilerFree === true;
}

/** Spectators watch the leader's hypothetical, but do not control it. */
export function isSpectatingHypothetical(): boolean {
  const { shared, ownHypothetical, hypothetical } = globals.state.replay;
  return (
    hypothetical !== undefined
    && ownHypothetical === undefined
    && shared !== undefined
    && !shared.amLeader
  );
}

function getCurrentReplaySegment() {
  return (
    globals.state.replay.segment ?? globals.state.ongoingGame.turn.segment!
  );
}

export function goToSegment(
  segment: number,
  breakFree = false,
  force = false,
): void {
  const finalSegment = getLastSegment();
  const currentSegment = getCurrentReplaySegment();

  // Validate the target segment. The target must be between 0 and the final replay segment.
  const newSegment = clamp(segment, 0, finalSegment);
  if (currentSegment === newSegment) {
    if (
      newSegment === finalSegment
      && globals.state.replay.hypothetical === undefined
      && !globals.state.finished
    ) {
      exit();
    }
    return;
  }

  // Disable replay navigation while we are in a hypothetical. (Hypothetical navigation functions
  // will set "force" equal to true.) Spectators can leave the leader's hypothetical by breaking
  // free from the shared segments.
  if (
    globals.state.replay.hypothetical !== undefined
    && !force
    && !(breakFree && isSpectatingHypothetical())
  ) {
    return;
  }

  // Enter the replay, if we are not already.
  enter(newSegment);

  // By default, most replay navigation actions should "break free" from the shared segments to
  // allow users to go off on their own side adventure through the game. However, if we are
  // navigating to a new segment as the shared replay leader, do not disable shared segments.
  if (
    breakFree
    && globals.state.replay.shared !== undefined
    && globals.state.replay.shared.useSharedSegments
    && !globals.state.replay.shared.amLeader
  ) {
    store.dispatch(
      gameUpdated({
        type: "replayUseSharedSegments",
        useSharedSegments: false,
      }),
    );
  }

  store.dispatch(
    gameUpdated({
      type: "replaySegment",
      segment: newSegment,
    }),
  );

  if (
    globals.state.replay.shared !== undefined
    && globals.state.replay.shared.amLeader
    && globals.state.replay.shared.useSharedSegments
  ) {
    store.dispatch(
      gameUpdated({
        type: "replaySharedSegment",
        segment: newSegment,
      }),
    );
  }
}

export function goToSegmentAndIndicateCard(
  segment: number,
  order: CardOrder,
): void {
  goToSegment(segment, true);

  // We indicate the card to make it easier to see.
  arrows.hideAll(); // We hide all the arrows first to ensure that the arrow is always shown
  const card = getCardOrStackBase(order);
  if (card) {
    arrows.toggle(card.order);
  }
}

// ---------------------------
// Replay navigation functions
// ---------------------------

export function back(breakFree = true): void {
  goToSegment(getCurrentReplaySegment() - 1, breakFree);
}

export function forward(): void {
  goToSegment(getCurrentReplaySegment() + 1, true);
}

export function backRound(): void {
  goToSegment(getCurrentReplaySegment() - globals.options.numPlayers, true);
}

export function forwardRound(): void {
  goToSegment(getCurrentReplaySegment() + globals.options.numPlayers, true);
}

export function backFull(): void {
  goToSegment(0, true);
}

export function forwardFull(): void {
  if (isSpoilerFree()) {
    return;
  }

  goToSegment(getLastSegment(), true);
}

// ------------------------
// The "Exit Replay" button
// ------------------------

export function exitButton(): void {
  // Mark the time that the user clicked the "Exit Replay" button (so that we can avoid an
  // accidental "Give Clue" double-click).
  globals.uiClickTime = Date.now();

  exit();
}

// ------------------
// The replay shuttle
// ------------------

// Gets the current segment from an X position relative to a maximum width
function segmentFromBarPosition(x: number, w: number) {
  const finalSegment = globals.state.ongoingGame.turn.segment!;
  if (finalSegment <= 0) {
    return 0;
  }
  const step = w / finalSegment;
  return Math.floor((x + step / 2) / step);
}

// Called when a position in the bar is clicked.
export function barClick(this: Konva.Rect): void {
  if (isSpoilerFree()) {
    return;
  }

  const pointer = globals.stage.getPointerPosition();
  if (pointer === null) {
    return;
  }
  const rectX = pointer.x - this.getAbsolutePosition().x;
  const w = globals.elements.replayBar!.width();
  goToSegment(segmentFromBarPosition(rectX, w), true);
}

// Called when a position in the bar is clicked.
export function barScroll(
  this: Konva.Rect,
  e: Konva.KonvaEventObject<WheelEvent>,
): void {
  let delta: number;
  if (e.evt.deltaY > 0) {
    delta = 1;
  } else if (e.evt.deltaY < 0) {
    delta = -1;
  } else {
    return;
  }

  goToSegment(getCurrentReplaySegment() + delta, true);
}

/**
 * The range that the center of a replay shuttle can move along the replay bar: the absolute x
 * position of its first stop and the distance to its last one.
 */
function shuttleTrack(shuttle: Konva.Node): { min: number; w: number } {
  return {
    min:
      globals.elements.replayBar!.getAbsolutePosition().x + shuttle.width() / 2,
    w: globals.elements.replayBar!.width() - shuttle.width(),
  };
}

// Restricts the positions of the replay shuttle. Given a desired position, returns the allowed
// position closest to it.
export function shuttleDragBound(
  this: Konva.Node,
  pos: Konva.Vector2d,
): { x: number; y: number } {
  const { min, w } = shuttleTrack(this);

  const shuttleX = clamp(pos.x - min, 0, w);
  const segment = segmentFromBarPosition(shuttleX, w);

  const finalSegment = globals.state.ongoingGame.turn.segment!;
  const step = finalSegment > 0 ? w / finalSegment : 0;

  return {
    x: min + segment * step,
    y: this.getAbsolutePosition().y,
  };
}

// Called when the shuttle moves. The position is guaranteed to be valid by shuttleDragBound.
export function shuttleDragMove(this: Konva.Rect): void {
  const { min, w } = shuttleTrack(this);
  const newSegment = segmentFromBarPosition(
    this.getAbsolutePosition().x - min,
    w,
  );
  goToSegment(newSegment, true);
}

function positionReplayShuttle(
  shuttle: Shuttle,
  targetSegment: number,
  smaller: boolean,
  fast: boolean,
) {
  let finalSegment = globals.state.ongoingGame.turn.segment;
  if (
    finalSegment === undefined // The final segment is undefined during initialization
    || finalSegment === 0 // The final segment is 0 before a move is made
  ) {
    // For the purposes of the replay shuttle calculation, we need to assume that there are at least
    // two possible locations.
    finalSegment = 1;
  }
  const sliderW = globals.elements.replayBar!.width() - shuttle.width();
  const x =
    globals.elements.replayBar!.x()
    + (sliderW / finalSegment) * targetSegment
    + shuttle.width() / 2;
  // The shuttle is drawn around its center.
  const y =
    globals.elements.replayBar!.y() + globals.elements.replayBar!.height() / 2;
  const scale = smaller ? OVERLAPPING_SHUTTLE_SCALE : 1;
  animate(
    shuttle,
    {
      duration: SHUTTLE_ANIMATION_SECONDS,
      x,
      y,
      scale,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseOut,
    },
    true,
    fast,
  );
}

export function adjustShuttles(fast: boolean): void {
  // The turn slider would show how long the game lasts.
  if (isSpoilerFree()) {
    globals.elements.replayBar!.hide();
    globals.elements.replayShuttle!.hide();
    globals.elements.replayShuttleShared!.hide();
    return;
  }

  // If the two shuttles are overlapping, then make the normal shuttle a little bit smaller.
  let smaller = false;
  if (
    globals.state.replay.shared !== undefined
    && !globals.state.replay.shared.useSharedSegments
    && globals.state.replay.segment === globals.state.replay.shared.segment
  ) {
    smaller = true;
  }

  const draggingShuttle = globals.elements.replayShuttle!.isDragging();

  // Adjust the replay shuttle along the bar based on the current segment. If it is smaller, we need
  // to nudge it to the right a bit in order to center it. Outside of a replay, it has no segment
  // and stays where it is.
  if (globals.state.replay.segment !== undefined) {
    positionReplayShuttle(
      globals.elements.replayShuttle!,
      globals.state.replay.segment,
      smaller,
      fast || draggingShuttle,
    );
  }

  // Adjust the shared replay shuttle along the bar based on the shared segment.
  globals.elements.replayShuttleShared!.visible(
    globals.state.replay.shared !== undefined,
  );
  if (globals.state.replay.shared !== undefined) {
    positionReplayShuttle(
      globals.elements.replayShuttleShared!,
      globals.state.replay.shared.segment,
      false,
      fast
        || (draggingShuttle
          && globals.state.replay.shared.segment
            === globals.state.replay.segment),
    );
  }
}

// -----------------------------
// Right-clicking the turn count
// -----------------------------

export function promptTurn(): void {
  const finalSegment = globals.state.ongoingGame.turn.segment! + 1;
  const currentSegment = getCurrentReplaySegment() + 1;

  showPrompt(
    {
      type: "number",
      title: "Which turn do you want to go to?",
      description: undefined,
      current: undefined,
      label: "Turn:",
      value: currentSegment.toString(),
      min: "1",
      // The maximum turn would show how long the game lasts.
      max: isSpoilerFree()
        ? undefined
        : Math.max(finalSegment, currentSegment).toString(),
    },
    goTo,
  );
}

export function goTo(turnString: string): void {
  const turn = parseIntSafe(turnString);
  if (turn === undefined) {
    return;
  }

  // A turn is an approximation for a segment. We minus one from the turn since turns are
  // represented to the user as starting from 1 (instead of from 0).
  const segment = turn - 1;

  goToSegment(segment, true);
}

// --------------------------------
// The "Toggle Shared Turns" button
// --------------------------------

export function toggleSharedSegments(): void {
  if (globals.state.replay.shared === undefined) {
    return;
  }

  store.dispatch(
    gameUpdated({
      type: "replayUseSharedSegments",
      useSharedSegments: !globals.state.replay.shared.useSharedSegments,
    }),
  );
}
