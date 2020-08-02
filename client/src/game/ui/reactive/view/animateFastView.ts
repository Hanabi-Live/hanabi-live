import State from '../../../types/State';
import globals from '../../globals';

export const onObserversStarted = (state: State, previousState: State | undefined) => {
  if (shouldNotUpdateAnimateFast(previousState)) {
    return;
  }

  const segmentDifference = Math.abs(state.replay.segment - previousState!.replay.segment);
  globals.animateFast = (
    // Entering a hypothetical should always be fast
    (state.replay.hypothetical !== null && previousState!.replay.hypothetical === null)
    // Exiting a hypothetical should always be fast
    || (state.replay.hypothetical === null && previousState!.replay.hypothetical !== null)
    // Converting a game to a replay should always be fast
    || (!state.playing && previousState!.playing)
    // Jumping ahead or behind in a replay by 2 or more segments should always be fast
    || (segmentDifference >= 2 && previousState!.replay.active)
    // If the replay shuttle is being dragged, always animate fast (note: it can be null)
    || globals.elements.replayShuttle?.isDragging() === true
  );
};

export const onObserversFinished = (_: State, previousState: State | undefined) => {
  if (shouldNotUpdateAnimateFast(previousState)) {
    return;
  }

  // All of the observers are finished firing, so reset "animateFast" back to false
  globals.animateFast = false;
};

const shouldNotUpdateAnimateFast = (previousState: State | undefined) => (
  // We want "animateFast" to remain true on the first time the visible state becomes valid
  previousState === undefined || previousState.visibleState === null
);
