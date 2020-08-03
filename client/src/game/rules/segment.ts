/* eslint-disable import/prefer-default-export */

import { GameAction } from '../types/actions';
import EndCondition from '../types/EndCondition';

// When the game state reducer sets "segment" to a new number,
// it is a signal to record the current state of the game (for the purposes of replays)
export const shouldStore = (
  segment: number | null,
  previousSegment: number | null,
  action: GameAction,
) => {
  if (segment === null) {
    // The game is still doing the initial deal
    return false;
  }

  // The types of "gameOver" that have to do with the previous action should meld together with the
  // segment of the previous action
  // Any new end conditions must also be updated in the "gameOver" block in "turnReducer.ts"
  if (
    action.type === 'gameOver'
    && action.endCondition !== EndCondition.Timeout
    && action.endCondition !== EndCondition.Terminated
    && action.endCondition !== EndCondition.IdleTimeout
  ) {
    return true;
  }

  // By default, store a new segment whenever the turn reducer changes the segment number
  return segment !== previousSegment;
};
