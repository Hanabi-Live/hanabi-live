import type { CardOrder } from "@hanabi-live/game";
import { isCardClued } from "@hanabi-live/game";
import type { State } from "./types/State.ts";

/**
 * We control our own hypothetical, and the leader controls the shared one. Spectators only watch.
 */
export function controlsHypothetical(state: State): boolean {
  const { shared, ownHypothetical, hypothetical } = state.replay;
  return (
    hypothetical !== undefined
    && (ownHypothetical !== undefined || shared?.amLeader === true)
  );
}

/** Whether the player who controls the hypothetical can show or hide the cards drawn in it. */
export function canToggleDrawnCards(state: State): boolean {
  return (
    controlsHypothetical(state) && getDrawnCardsLockTurn(state) === undefined
  );
}

/**
 * A shared hypothetical keeps its drawn cards shown or hidden as they are once a drawn card has
 * been played, discarded, or clued, until the leader goes back to before that move. Returns the
 * turn of that move, counted from 1 as the screen shows it, or undefined if the drawn cards are not
 * locked.
 */
export function getDrawnCardsLockTurn(state: State): number | undefined {
  const { shared, hypothetical } = state.replay;
  if (hypothetical === undefined || hypothetical !== shared?.hypothetical) {
    return undefined;
  }

  const { states, drawnCardsInHypothetical } = hypothetical;
  // Each state follows one move, and the first state is the one that the hypothetical started on.
  const lockIndex = states.findIndex((gameState) =>
    drawnCardsInHypothetical.some((order) => {
      const card = gameState.deck[order];
      if (card === undefined) {
        // The card is not drawn yet in this state.
        return false;
      }
      const cardOrder = order as CardOrder;
      const inHand = gameState.hands.some((hand) => hand.includes(cardOrder));
      return !inHand || isCardClued(card);
    }),
  );
  const moveState = states[lockIndex - 1];
  return moveState === undefined ? undefined : moveState.turn.turnNum + 1;
}
