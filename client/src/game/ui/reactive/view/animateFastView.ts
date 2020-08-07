import State from '../../../types/State';
import globals from '../../globals';

export const onObserversStarted = (state: State, previousState: State | undefined) => {
  // We want "animateFast" to remain true on the first time the visible state becomes valid
  if (previousState === undefined || previousState.visibleState === null) {
    return;
  }

  // Find out how many segments we are jumping through in this state change
  const currentSegment = state.replay.active
    ? state.replay.segment
    : state.ongoingGame.turn.segment;
  const oldSegment = previousState!.replay.active
    ? previousState.replay.segment
    : previousState?.ongoingGame.turn.segment;
  let segmentDifference = 0;
  if (currentSegment !== null && oldSegment !== null) {
    segmentDifference = Math.abs(currentSegment - oldSegment);
  }

  globals.animateFast = (
    // Converting a game to a shared replay should always be fast
    (!state.playing && previousState.playing)
    || (state.replay.shared !== null && previousState.replay.shared === null)
    // Jumping ahead or behind in a replay by 2 or more segments should always be fast
    || segmentDifference >= 2
    // If the replay shuttle is being dragged, always animate fast (note: it can be null)
    || globals.elements.replayShuttle?.isDragging() === true
    // Entering a hypothetical should always be fast
    || (state.replay.hypothetical !== null && previousState.replay.hypothetical === null)
    // Exiting a hypothetical should always be fast
    || (state.replay.hypothetical === null && previousState.replay.hypothetical !== null)
  );
};

export const onObserversFinished = (_: State, previousState: State | undefined) => {
  // We want "animateFast" to remain true on the first time the visible state becomes valid
  if (previousState === undefined || previousState.visibleState === null) {
    return;
  }

  // All of the observers are finished firing, so reset "animateFast" back to false
  globals.animateFast = false;
};
