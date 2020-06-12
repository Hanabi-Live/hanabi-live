/* eslint-disable import/prefer-default-export */
// Functions related to hand management: card counts

export function cardsPerHand(playerCount: number) {
  switch (playerCount) {
    case 2: case 3: {
      return 5;
    }
    case 4: case 5: {
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
