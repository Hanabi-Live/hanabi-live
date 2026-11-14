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

/**
 * Whether the player who controls the hypothetical can show or hide the cards drawn in it. In a
 * shared hypothetical, a drawn card that has been played, discarded, or clued stays shown.
 */
export function canToggleDrawnCards(state: State): boolean {
  const { shared, hypothetical } = state.replay;
  if (hypothetical === undefined || !controlsHypothetical(state)) {
    return false;
  }

  if (hypothetical !== shared?.hypothetical) {
    return true;
  }

  const { ongoing } = hypothetical;
  return hypothetical.drawnCardsInHypothetical.every((order) => {
    const card = ongoing.deck[order];
    const cardOrder = order as CardOrder;
    const inHand = ongoing.hands.some((hand) => hand.includes(cardOrder));
    return inHand && (card === undefined || !isCardClued(card));
  });
}
