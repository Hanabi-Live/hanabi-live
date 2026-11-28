import type { CardState } from "@hanabi-live/game";
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
 * Whether a card on the screen has left its hand in the game now. The in-game replay shows the
 * hands of an old turn. A player can make a move from there, but only with a card that is still in
 * the same hand.
 */
export function hasLeftItsHand(state: State, card: CardState): boolean {
  return (
    state.replay.segment !== undefined
    && state.replay.hypothetical === undefined
    && state.ongoingGame.deck[card.order]?.location !== card.location
  );
}
