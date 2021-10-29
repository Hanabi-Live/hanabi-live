// Functions related to deck information: total cards, drawing cards

import { getVariant } from "../data/gameData";
import CardState from "../types/CardState";
import { START_CARD_RANK } from "../types/constants";
import GameMetadata from "../types/GameMetadata";
import Suit from "../types/Suit";
import Variant from "../types/Variant";
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
      totalCardsInTheDeck -= 1;
    }
  }
  return totalCardsInTheDeck;
}

// Given a variant, and a card's rank and suit, returns how many copies of
// this card exist in the deck
export function numCopiesOfCard(
  suit: Suit,
  rank: number,
  variant: Variant,
): number {
  // In a normal suit of Hanabi,
  // there are three 1's, two 2's, two 3's, two 4's, and one 5
  let amountToAdd = 2;
  if (rank === 1) {
    amountToAdd = 3;
    if (variantRules.isUpOrDown(variant) || suit.reversed) {
      amountToAdd = 1;
    }
  } else if (rank === 4) {
    if (variantRules.isCriticalFours(variant)) {
      amountToAdd = 1;
    }
  } else if (rank === 5) {
    amountToAdd = 1;
    if (suit.reversed) {
      amountToAdd = 3;
    }
  } else if (rank === START_CARD_RANK) {
    if (variantRules.isUpOrDown(variant)) {
      amountToAdd = 1;
    } else {
      throw new Error(
        "Trying to add a Start card to a variant that is not Up or Down",
      );
    }
  }

  if (suit.oneOfEach) {
    amountToAdd = 1;
  }
  return amountToAdd;
}

// Returns how many cards of a specific suit/rank that have been already discarded
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
