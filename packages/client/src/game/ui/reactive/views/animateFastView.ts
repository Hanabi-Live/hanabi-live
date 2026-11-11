import type { State } from "../../../types/State.ts";
import { globals } from "../../UIGlobals.ts";

export function onObserversStarted(
  state: State,
  previousState: State | undefined,
): void {
  // We want "animateFast" to remain true on the first time the visible state becomes valid.
  if (previousState === undefined || previousState.visibleState === undefined) {
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
  if (currentSegment !== undefined && oldSegment !== undefined) {
    segmentDifference = Math.abs(currentSegment - oldSegment);
  }

  globals.animateFast =
    // If the window is being resized, we should always animate fast (e.g. skip animations).
    globals.isResizing
    // Converting a game to a shared replay should always be fast.
    || (!state.playing && previousState.playing)
    || (state.replay.shared !== undefined
      && previousState.replay.shared === undefined)
    // Jumping ahead or behind in a replay by 2 or more segments should always be fast.
    || segmentDifference >= 2
    // If the replay shuttle is being dragged, always animate fast. (Note that it can be undefined.)
    || globals.elements.replayShuttle?.isDragging() === true
    // Entering a hypothetical should always be fast.
    || (state.replay.hypothetical !== undefined
      && previousState.replay.hypothetical === undefined)
    // Exiting a hypothetical should always be fast.
    || (state.replay.hypothetical === undefined
      && previousState.replay.hypothetical !== undefined);
}

export function onObserversFinished(
  _: State,
  previousState: State | undefined,
): void {
  // We want "animateFast" to remain true on the first time the visible state becomes valid.
  if (previousState === undefined || previousState.visibleState === undefined) {
    return;
  }

  // All of the observers are finished firing, so reset "animateFast" back to false.
  if (!globals.isResizing) {
    globals.animateFast = false;
  }
}
