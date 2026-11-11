import { globals } from "./UIGlobals.ts";
import { controlsHypothetical } from "./controlsHypothetical.ts";

/**
 * Used to determine if it is our turn in the present. (For example, it can be our turn in the
 * present while we are looking through past actions in an in-game replay.)
 */
export function isOurTurn(): boolean {
  // First, handle the special case of a hypothetical.
  if (globals.state.replay.hypothetical !== undefined) {
    // It is always the turn of whoever controls the hypothetical.
    return controlsHypothetical(globals.state);
  }

  // Handle the case of an ongoing game.
  return (
    globals.state.playing
    && globals.state.ongoingGame.turn.currentPlayerIndex
      === globals.metadata.ourPlayerIndex
  );
}
