// Functions related to deck information: total cards, drawing cards

import { sumArray } from "complete-common";
import { START_CARD_RANK } from "../constants";
import { getVariant } from "../gameData";
import type { CardState } from "../interfaces/CardState";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { Suit } from "../interfaces/Suit";
import type { Variant } from "../interfaces/Variant";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
import { isCardDiscarded } from "./cardState";
import { getCardsPerHand } from "./hand";

export function getTotalCardsInDeck(variant: Variant): number {
  const suitCounts = variant.suits.map((suit) =>
    getTotalCardsInSuit(variant, suit),
  );

  return sumArray(suitCounts);
}

function getTotalCardsInSuit(variant: Variant, suit: Suit): number {
  if (suit.oneOfEach) {
    if (variant.upOrDown) {
      // A critical suit in up or down has all unique cards plus an extra start card.
      return variant.stackSize + 1;
    }
    return variant.stackSize;
  }

  if (
    variant.upOrDown ||
    variant.criticalRank !== undefined ||
    variant.scarceOnes
  ) {
    // The normal amount minus one because there is one fewer card.
    return variant.stackSize * 2 - 1;
  }

  // The normal amount: three 1's + two 2's + two 3's + two 4's + one 5
  return variant.stackSize * 2;
}

/**
 * Returns how many copies of this card should exist in the deck.
 *
 * This implementation mirrors `numCopiesOfCard` in "server/src/game_deck.go".
 */
export function getNumCopiesOfCard(
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

      if (variant.scarceOnes) {
        return 2;
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
export function getNumDiscardedCopiesOfCard(
  deck: readonly CardState[],
  suitIndex: SuitIndex,
  rank: Rank,
): number {
  let numDiscardedCopiesOfCard = 0;

  for (const cardState of deck) {
    if (
      cardState.suitIndex === suitIndex
      && cardState.rank === rank
      && isCardDiscarded(cardState)
    ) {
      numDiscardedCopiesOfCard++;
    }
  }

  return numDiscardedCopiesOfCard;
}

export function isInitialDealFinished(
  currentDeckSize: number,
  metadata: GameMetadata,
): boolean {
  const variant = getVariant(metadata.options.variantName);
  const totalCardsInDeck = getTotalCardsInDeck(variant);
  const numCardsPerHand = getCardsPerHand(metadata.options);
  return (
    currentDeckSize
    === totalCardsInDeck - metadata.options.numPlayers * numCardsPerHand
  );
}

export function getDiscardHelpers(
  variant: Variant,
  deck: readonly CardState[],
): {
  isLastCopy: (suitIndex: SuitIndex, rank: Rank) => boolean;
  isAllDiscarded: (suitIndex: SuitIndex, rank: Rank) => boolean;
} {
  // eslint-disable-next-line func-style
  const total = (suitIndex: SuitIndex, rank: Rank) => {
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
      return 0;
    }

    return getNumCopiesOfCard(suit, rank, variant);
  };

  // eslint-disable-next-line func-style
  const discarded = (suitIndex: SuitIndex, rank: Rank) =>
    getNumDiscardedCopiesOfCard(deck, suitIndex, rank);

  // eslint-disable-next-line func-style
  const isLastCopy = (suitIndex: SuitIndex, rank: Rank) =>
    total(suitIndex, rank) === discarded(suitIndex, rank) + 1;

  // eslint-disable-next-line func-style
  const isAllDiscarded = (suitIndex: SuitIndex, rank: Rank) =>
    total(suitIndex, rank) === discarded(suitIndex, rank);

  return { isLastCopy, isAllDiscarded };
}

export function getAllDiscardedSetForSuit(
  variant: Variant,
  deck: readonly CardState[],
  suitIndex: SuitIndex,
): ReadonlySet<Rank> {
  const { isAllDiscarded } = getDiscardHelpers(variant, deck);

  const allDiscardedSet = new Set<Rank>();
  for (const variantRank of variant.ranks) {
    if (isAllDiscarded(suitIndex, variantRank)) {
      allDiscardedSet.add(variantRank);
    }
  }

  return allDiscardedSet;
}
