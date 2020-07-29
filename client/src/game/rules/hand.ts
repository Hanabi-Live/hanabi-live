// Functions related to hand management

import { cardRules } from '../rules';
import CardState from '../types/CardState';

export const cardsPerHand = (
  numPlayers: number,
  oneExtraCard: boolean,
  oneLessCard: boolean,
) => cardsPerHandNatural(numPlayers) + (oneExtraCard ? 1 : 0) - (oneLessCard ? 1 : 0);

export const cardsPerHandNatural = (numPlayers: number) => {
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
};

// For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game)
export const cardSlot = (targetOrder: number, hand: number[]) => {
  const index = hand.indexOf(targetOrder);
  return index >= 0 ? hand.length - index : null;
};

export const isLocked = (hand: readonly number[], deck: readonly CardState[]) => {
  for (const cardOrder of hand) {
    const card = deck[cardOrder];
    if (!cardRules.isClued(card)) {
      return false;
    }
  }

  return true;
};

export const chopIndex = (hand: readonly number[], deck: readonly CardState[]) => {
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
};
