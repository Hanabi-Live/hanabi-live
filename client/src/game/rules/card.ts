/* eslint-disable import/prefer-default-export */

import CardState from '../types/CardState';
import { STACK_BASE_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';
import * as deckRules from './deck';
import * as playStacksRules from './playStacks';
import * as variantRules from './variant';
import * as reversibleRules from './variants/reversible';

export function isClued(card: CardState) {
  return card.numPositiveClues > 0;
}

export function isPlayed(card: CardState) {
  return card.location === 'playStack';
}

export function isDiscarded(card: CardState) {
  return card.location === 'discard';
}

export function isInPlayerHand(card: CardState) {
  return typeof card.location === 'number';
}

export function isCritical(
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  card: CardState,
) {
  if (
    card.suitIndex === null
    || card.rank === null
    || card.rank === 0 // Base
    || isPlayed(card)
    || isDiscarded(card)
    || !needsToBePlayed(variant, deck, playStacks, stackDirections, card)
  ) {
    return false;
  }

  // "Up or Down" has some special cases for critical cards
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.isCardCritical(
      variant,
      deck,
      stackDirections,
      card,
    );
  }

  const total = deckRules.numCopiesOfCard(
    variant,
    variant.suits[card.suitIndex],
    card.rank,
  );
  const discarded = deckRules.discardedCopies(deck, card.suitIndex, card.rank);
  return total === discarded + 1;
}

// needsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
// (this mirrors the server function in "card.go")
export function needsToBePlayed(
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  card: CardState,
) {
  // First, check to see if a copy of this card has already been played
  for (const otherCard of deck) {
    if (otherCard.order === card.order) {
      continue;
    }
    if (
      otherCard.suitIndex === card.suitIndex
      && otherCard.rank === card.rank
      && isPlayed(otherCard)
    ) {
      return false;
    }
  }

  // Determining if the card needs to be played in variants with reversed suits is more
  // complicated
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.needsToBePlayed(
      variant,
      deck,
      playStacks,
      stackDirections,
      card,
    );
  }

  const total = (s: number, r: number) => deckRules.numCopiesOfCard(
    variant,
    variant.suits[s],
    r,
  );
  const discarded = (s: number, r: number) => deckRules.discardedCopies(deck, s, r);
  const isAllDiscarded = (s: number, r: number) => total(s, r) === discarded(s, r);

  // Second, check to see if it is still possible to play this card
  // (the preceding cards in the suit might have already been discarded)
  for (let i = 1; i < card.rank!; i++) {
    if (isAllDiscarded(card.suitIndex!, i)) {
      // The suit is "dead", so this card does not need to be played anymore
      return false;
    }
  }

  // By default, all cards not yet played will need to be played
  return true;
}

export function isPotentiallyPlayable(
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  card: CardState,
) {
  // Calculating this in an Up or Down variant is more complicated
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.isPotentiallyPlayable(variant, deck, playStacks, stackDirections, card);
  }

  for (const [suitIndex, rank] of card.matchingCardsArray) {
    if (card.unseenCards[suitIndex][rank] <= 0) {
      continue;
    }
    let lastPlayedRank = playStacksRules.lastPlayedRank(playStacks[suitIndex], deck);
    if (lastPlayedRank === 5) {
      continue;
    }
    if (lastPlayedRank === STACK_BASE_RANK) {
      lastPlayedRank = 0;
    }
    const nextRankNeeded = lastPlayedRank + 1;
    if (nextRankNeeded === rank) {
      return true;
    }
  }

  return false;
}
