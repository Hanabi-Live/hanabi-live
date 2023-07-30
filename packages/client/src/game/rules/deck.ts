// Functions related to deck information: total cards, drawing cards

import type { Rank, Suit, SuitIndex, Variant } from "@hanabi/data";
import { START_CARD_RANK, getVariant } from "@hanabi/data";
import type { CardState } from "../types/CardState";
import type { GameMetadata } from "../types/GameMetadata";
import * as cardRules from "./card";
import * as handRules from "./hand";

export function totalCards(variant: Variant): number {
  let totalCardsInTheDeck = 0;

  for (const suit of variant.suits) {
    totalCardsInTheDeck += totalCardsInSuit(variant, suit);
  }

  return totalCardsInTheDeck;
}

function totalCardsInSuit(variant: Variant, suit: Suit): number {
  if (suit.oneOfEach) {
    return variant.singleStackSize;
  }

  if (variant.upOrDown || variant.criticalRank !== undefined) {
    return 9; // The normal amount minus one because there is one more critical card.
  }

  return 2 * variant.singleStackSize; // Three 1's + Two 2's + Two 3's + Two 4's + One 5
}

/**
 * Returns how many copies of this card should exist in the deck.
 *
 * This implementation mirrors `numCopiesOfCard` in "server/src/game_deck.go".
 */
export function numCopiesOfCard(
  suit: Suit,
  rank: Rank,
  variant: Variant,
): number {
  if (suit.oneOfEach) {
    return 1;
  }

  if (variant.criticalRank === rank) {
    return 1;
  }

  // Sudoku always has 2 cards.
  if (variant.sudoku) {
    return 2;
  }

  switch (rank) {
    case 1: {
      if (variant.upOrDown || suit.reversed) {
        return 1;
      }

      return 3;
    }

    case 2: {
      return 2;
    }

    case 3: {
      return 2;
    }

    case 4: {
      return 2;
    }

    case 5: {
      if (suit.reversed) {
        return 3;
      }

      return 1;
    }

    case START_CARD_RANK: {
      if (variant.upOrDown) {
        return 1;
      }

      throw new Error(
        "Attempted to add a START card to a variant that is not Up or Down.",
      );
    }
  }
}

/** Returns how many cards of a specific suit/rank that have been already discarded. */
export function discardedCopies(
  deck: readonly CardState[],
  suitIndex: SuitIndex,
  rank: Rank,
): number {
  let numDiscardedCopies = 0;

  for (const card of deck) {
    if (
      card.suitIndex === suitIndex &&
      card.rank === rank &&
      cardRules.isDiscarded(card)
    ) {
      numDiscardedCopies++;
    }
  }

  return numDiscardedCopies;
}

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
