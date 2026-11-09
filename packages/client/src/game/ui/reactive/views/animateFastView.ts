import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";

/** Replay steps closer together than this are fast-forwarding, such as when a key is held down. */
const FAST_FORWARD_STEP_MS = 500;

export function onObserversStarted(
  state: State,
  previousState: State | undefined,
): void {
  // We want "animateFast" to remain true on the first time the visible state becomes valid.
  if (previousState === undefined || previousState.visibleState === null) {
    return;
  }

  // Find out how many segments we are jumping through in this state change.
  const currentSegment = state.replay.active
    ? state.replay.segment
    : state.ongoingGame.turn.segment;
  const oldSegment = previousState.replay.active
    ? previousState.replay.segment
    : previousState.ongoingGame.turn.segment;
  let segmentDifference = 0;
  if (currentSegment !== null && oldSegment !== null) {
    segmentDifference = Math.abs(currentSegment - oldSegment);
  }

  if (
    state.replay.active
    && currentSegment !== null
    && oldSegment !== null
    && currentSegment > oldSegment
  ) {
    const now = Date.now();
    globals.fastForwarding =
      now - globals.lastReplayStepTimeMS < FAST_FORWARD_STEP_MS;
    globals.lastReplayStepTimeMS = now;
    if (globals.fastForwarding) {
      stopStackCompleteAnimations();
    }
  }

  globals.animateFast =
    // If the window is being resized, we should always animate fast (e.g. skip animations).
    globals.isResizing
    // Converting a game to a shared replay should always be fast.
    || (!state.playing && previousState.playing)
    || (state.replay.shared !== null && previousState.replay.shared === null)
    // Jumping ahead or behind in a replay by 2 or more segments should always be fast.
    || segmentDifference >= 2
    // If the replay shuttle is being dragged, always animate fast. (Note that it can be null.)
    || globals.elements.replayShuttle?.isDragging() === true
    // Entering a hypothetical should always be fast.
    || (state.replay.hypothetical !== null
      && previousState.replay.hypothetical === null)
    // Exiting a hypothetical should always be fast.
    || (state.replay.hypothetical === null
      && previousState.replay.hypothetical !== null);
}

export function onObserversFinished(
  _: State,
  previousState: State | undefined,
): void {
  // We want "animateFast" to remain true on the first time the visible state becomes valid.
  if (previousState === undefined || previousState.visibleState === null) {
    return;
  }

  // All of the observers are finished firing, so reset "animateFast" back to false.
  if (!globals.isResizing) {
    globals.animateFast = false;
  }
  globals.fastForwarding = false;
}

function stopStackCompleteAnimations() {
  for (const { layout } of globals.deck) {
    if (layout.stackCompleteAnimation !== null) {
      layout.stackCompleteAnimation.stop();
      layout.stackCompleteAnimation = null;
    }
  }
}
