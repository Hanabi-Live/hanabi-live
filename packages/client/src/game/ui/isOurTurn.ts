import { controlsHypothetical } from "../controlsHypothetical.ts";
import { isOurSeat } from "../ourSeat.ts";
import { globals } from "./UiGlobals.ts";

/**
 * Used to determine if it is our turn in the present. (For example, it can be our turn in the
 * present while we are looking through past actions in an in-game replay.)
 */
export function isOurTurn(): boolean {
  // In a hypothetical, it is always the turn of whoever controls the hypothetical.
  return globals.state.replay.hypothetical === undefined
    ? globals.state.playing
        && isOurSeat(
          globals.state.ongoingGame.turn.currentPlayerIndex,
          globals.metadata,
        )
    : controlsHypothetical(globals.state);
}
