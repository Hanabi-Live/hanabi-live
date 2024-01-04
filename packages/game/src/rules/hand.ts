// Functions related to hand management.

import type { CardState } from "../interfaces/CardState";
import type { Options } from "../interfaces/Options";
import type { CardOrder } from "../types/CardOrder";
import type { NumPlayers } from "../types/NumPlayers";
import { isCardClued } from "./cardState";

export function getCardsPerHand(options: Options): number {
  return (
    getCardsPerHandNatural(options.numPlayers) +
    (options.oneExtraCard ? 1 : 0) -
    (options.oneLessCard ? 1 : 0)
  );
}

function getCardsPerHandNatural(numPlayers: NumPlayers): number {
  switch (numPlayers) {
    case 2:
    case 3: {
      return 5;
    }

    case 4:
    case 5: {
      return 4;
    }

    case 6: {
      return 3;
    }

    default: {
      // Default to 3 cards for non-standard player numbers.
      return 3;
    }
  }
}

/** For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game). */
export function getCardSlot(
  order: CardOrder,
  hand: readonly number[],
): number | undefined {
  const index = hand.indexOf(order);
  return index === -1 ? undefined : hand.length - index;
}

export function isHandLocked(
  hand: readonly number[],
  deck: readonly CardState[],
): boolean {
  return hand.every((order) => {
    const cardState = deck[order];
    return cardState !== undefined && isCardClued(cardState);
  });
}

export function getChopIndex(
  hand: readonly number[],
  deck: readonly CardState[],
): number {
  // The chop is defined as the oldest (right-most) unclued card.
  for (const [i, cardOrder] of hand.entries()) {
    const cardState = deck[cardOrder];
    if (cardState && !isCardClued(cardState)) {
      return i;
    }
  }

  // Their hand is filled with clued cards, so the chop is considered to be their newest (left-most)
  // card.
  return hand.length - 1;
}

export function isCardOnChop(
  hand: readonly number[],
  deck: readonly CardState[],
  card: CardState,
): boolean {
  const cardIndexInHand = hand.indexOf(card.order);
  const handChopIndex = getChopIndex(hand, deck);
  return cardIndexInHand === handChopIndex;
}
