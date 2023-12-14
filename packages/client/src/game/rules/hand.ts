// Functions related to hand management.

import type { NumPlayers } from "@hanabi/data";
import type { CardOrder, CardState } from "@hanabi/game";
import type { Options } from "../../types/Options";
import * as cardRules from "./card";

export function cardsPerHand(options: Options): number {
  return (
    cardsPerHandNatural(options.numPlayers) +
    (options.oneExtraCard ? 1 : 0) -
    (options.oneLessCard ? 1 : 0)
  );
}

function cardsPerHandNatural(numPlayers: NumPlayers): number {
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
export function cardSlot(
  order: CardOrder,
  hand: readonly number[],
): number | undefined {
  const index = hand.indexOf(order);
  return index === -1 ? undefined : hand.length - index;
}

export function isLocked(
  hand: readonly number[],
  deck: readonly CardState[],
): boolean {
  return hand.every((order) => {
    const card = deck[order];
    return card !== undefined && cardRules.isCardClued(card);
  });
}

export function chopIndex(
  hand: readonly number[],
  deck: readonly CardState[],
): number {
  // The chop is defined as the oldest (right-most) unclued card.
  for (const [i, cardOrder] of hand.entries()) {
    const card = deck[cardOrder];
    if (card && !cardRules.isCardClued(card)) {
      return i;
    }
  }

  // Their hand is filled with clued cards, so the chop is considered to be their newest (left-most)
  // card.
  return hand.length - 1;
}

export function cardIsOnChop(
  hand: readonly number[],
  deck: readonly CardState[],
  card: CardState,
): boolean {
  const cardIndexInHand = hand.indexOf(card.order);
  const handChopIndex = chopIndex(hand, deck);
  return cardIndexInHand === handChopIndex;
}
