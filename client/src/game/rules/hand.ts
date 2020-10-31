// Functions related to hand management

import Options from "../../types/Options";
import { cardRules } from "../rules";
import CardState from "../types/CardState";

export const cardsPerHand = (options: Options): number =>
  cardsPerHandNatural(options.numPlayers) +
  (options.oneExtraCard ? 1 : 0) -
  (options.oneLessCard ? 1 : 0);

export function cardsPerHandNatural(numPlayers: number): number {
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
      // Default to 3 cards for non-standard player numbers
      return 3;
    }
  }
}

// For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game)
export function cardSlot(targetOrder: number, hand: number[]): number | null {
  const index = hand.indexOf(targetOrder);
  return index >= 0 ? hand.length - index : null;
}

export function isLocked(
  hand: readonly number[],
  deck: readonly CardState[],
): boolean {
  for (const cardOrder of hand) {
    const card = deck[cardOrder];
    if (!cardRules.isClued(card)) {
      return false;
    }
  }

  return true;
}

export function chopIndex(
  hand: readonly number[],
  deck: readonly CardState[],
): number {
  // The chop is defined as the oldest (right-most) unclued card
  for (let i = 0; i < hand.length; i++) {
    const cardOrder = hand[i];
    const card = deck[cardOrder];
    if (!cardRules.isClued(card)) {
      return i;
    }
  }

  // Their hand is filled with clued cards,
  // so the chop is considered to be their newest (left-most) card
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
