import { controlsHypothetical } from "../controlsHypothetical.ts";
import { isOurSeat } from "../ourSeat.ts";
import type { State } from "../types/State.ts";
import { globals } from "./UiGlobals.ts";

/**
 * Used to determine if it is our turn in the present. (For example, it can be our turn in the
 * present while we are looking through past actions in an in-game replay.)
 */
export function isOurTurn(): boolean {
  // In a hypothetical, it is always the turn of whoever controls the hypothetical.
  return globals.state.replay.hypothetical === undefined
    ? isOurTurnInOngoingGame()
    : controlsHypothetical(globals.state);
}

/**
 * Whether it is our turn in the real game. A hypothetical does not change this, so that a player
 * who explores one during a game gets no notification and sends no premove on another player's
 * turn.
 */
export function isOurTurnInOngoingGame(): boolean {
  return (
    globals.state.playing
    && isOurSeat(
      globals.state.ongoingGame.turn.currentPlayerIndex,
      globals.metadata,
    )
  );
}

/**
 * Whether the screen shows an old turn of the game in a replay, outside of a hypothetical. A real
 * move is not made from there, because the cards on screen are not the cards of the game now.
 */
export function isViewingOldTurn(state: State): boolean {
  return (
    state.replay.segment !== undefined
    && state.replay.hypothetical === undefined
  );
}
