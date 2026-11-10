import type { State } from "../types/State";

/**
 * We control our own hypothetical, and the leader controls the shared one. Spectators only watch.
 */
export function controlsHypothetical(state: State): boolean {
  const { hypothetical, ownHypothetical, shared } = state.replay;
  return (
    hypothetical !== undefined
    && (ownHypothetical !== undefined || shared?.amLeader === true)
  );
}
