/* eslint-disable import/prefer-default-export */

import State from '../../../types/State';
import globals from '../../globals';

export const onObserversStarted = (state: State, previousState: State | undefined) => {
  if (shouldNotUpdateAnimateFast(previousState)) {
    return;
  }

  const segmentDifference = Math.abs(state.replay.segment - previousState!.replay.segment);
  globals.animateFast = (
    // Entering a replay should always be fast
    (state.replay.active && !previousState!.replay.active)
    // Exiting a replay should always be fast
    || (!state.replay.active && previousState!.replay.active)
    // Entering a hypothetical should always be fast
    || (state.replay.hypothetical !== null && previousState!.replay.hypothetical === null)
    // Exiting a hypothetical should always be fast
    || (state.replay.hypothetical === null && previousState!.replay.hypothetical !== null)
    // Jumping ahead or behind in a replay by 2 or more segments should always be fast
    || segmentDifference >= 2
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
