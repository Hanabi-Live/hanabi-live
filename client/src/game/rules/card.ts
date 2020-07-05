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
    || card.isPlayed
    || card.isDiscarded
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
      && otherCard.isPlayed
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

  let potentiallyPlayable = false;
  for (const [suitIndex] of variant.suits.entries()) {
    let lastPlayedRank = playStacksRules.lastPlayedRank(playStacks[suitIndex], deck);
    if (lastPlayedRank === 5) {
      continue;
    }
    if (lastPlayedRank === STACK_BASE_RANK) {
      lastPlayedRank = 0;
    }
    const nextRankNeeded = lastPlayedRank + 1;
    const count = card.possibleCards[suitIndex][nextRankNeeded];
    if (count === undefined) {
      throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${nextRankNeeded} from the "possibleCards" map for card ${card.order}.`);
    }
    if (count > 0) {
      potentiallyPlayable = true;
      break;
    }
  }

  return potentiallyPlayable;
}
