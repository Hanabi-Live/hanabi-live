// Functions related to deck information: total cards, drawing cards

import type { Suit, Variant } from "@hanabi/data";
import { START_CARD_RANK, getVariant } from "@hanabi/data";
import type { CardState } from "../types/CardState";
import type { GameMetadata } from "../types/GameMetadata";
import * as cardRules from "./card";
import * as handRules from "./hand";
import * as variantRules from "./variant";

export function totalCards(variant: Variant): number {
  let totalCardsInTheDeck = 0;
  for (const suit of variant.suits) {
    totalCardsInTheDeck += 10;
    if (suit.oneOfEach) {
      totalCardsInTheDeck -= 5;
    } else if (
      variantRules.isUpOrDown(variant) ||
      variantRules.isCriticalFours(variant)
    ) {
      totalCardsInTheDeck--;
    }
  }
  return totalCardsInTheDeck;
}

// Given a variant, and a card's rank and suit, returns how many copies of this card exist in the
// deck.
export function numCopiesOfCard(
  suit: Suit,
  rank: number,
  variant: Variant,
): number {
  // This implementation mirrors numCopiesOfCard in "server/src/game_deck.go".
  if (suit.oneOfEach) {
    return 1;
  }

  if (variantRules.isSudoku(variant)) {
    // Sudoku always has 2 cards.
    return 2;
  }

  if (rank === 1) {
    if (variantRules.isUpOrDown(variant) || suit.reversed) {
      return 1;
    }
    return 3;
  }

  if (rank === 4) {
    if (variantRules.isCriticalFours(variant)) {
      return 1;
    }
  }

  if (rank === 5) {
    if (suit.reversed) {
      return 3;
    }
    return 1;
  }

  if (rank === START_CARD_RANK) {
    if (variantRules.isUpOrDown(variant)) {
      return 1;
    }
    throw new Error(
      "Trying to add a Start card to a variant that is not Up or Down",
    );
  }

  return 2;
}

// Returns how many cards of a specific suit/rank that have been already discarded.
export const discardedCopies = (
  deck: readonly CardState[],
  suitIndex: number,
  rank: number,
): number =>
  deck.reduce((discarded, c) => {
    if (
      c.suitIndex === suitIndex &&
      c.rank === rank &&
      cardRules.isDiscarded(c)
    ) {
      return discarded + 1;
    }
    return discarded;
  }, 0);

export function isInitialDealFinished(
  currentDeckSize: number,
  metadata: GameMetadata,
): boolean {
  const variant = getVariant(metadata.options.variantName);
  const totalCardsInTheDeck = totalCards(variant);
  const numCardsPerHand = handRules.cardsPerHand(metadata.options);
  return (
    currentDeckSize ===
    totalCardsInTheDeck - metadata.options.numPlayers * numCardsPerHand
  );
}
