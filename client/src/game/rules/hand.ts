// Functions related to hand management
/* eslint-disable import/prefer-default-export */

export function cardsPerHand(numPlayers: number, oneExtraCard: boolean, oneLessCard: boolean) {
  return cardsPerHandNatural(numPlayers)
    + (oneExtraCard ? 1 : 0)
    - (oneLessCard ? 1 : 0);
}

export function cardsPerHandNatural(numPlayers: number) {
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
export const cardSlot = (targetOrder: number, hand: number[]) => {
  const index = hand.indexOf(targetOrder);
  return index >= 0 ? hand.length - index : null;
};
