/* eslint-disable import/prefer-default-export */

import CardState from '../types/CardState';
import CardStatus from '../types/CardStatus';
import { START_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';
import * as deckRules from './deck';
import * as variantRules from './variant';
import * as reversibleRules from './variants/reversible';

export const name = (suitIndex: number, rank: number, variant: Variant) => {
  const suitName = variant.suits[suitIndex].name;
  let rankName = rank.toString();
  if (rank === START_CARD_RANK) {
    rankName = 'START';
  }
  return `${suitName} ${rankName}`;
};

export const isClued = (card: CardState) => card.numPositiveClues > 0;

export const isPlayed = (card: CardState) => card.location === 'playStack';

export const isDiscarded = (card: CardState) => card.location === 'discard';

export const isInPlayerHand = (card: CardState) => typeof card.location === 'number';

// needsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
// This mirrors the server function "Card.NeedsToBePlayed()"
export const needsToBePlayed = (
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
  // First, check to see if a copy of this card has already been played
  for (const otherCard of deck) {
    if (
      otherCard.suitIndex === suitIndex
      && otherCard.rank === rank
      && isPlayed(otherCard)
    ) {
      return false;
    }
  }

  // Determining if the card needs to be played in variants with reversed suits is more complicated
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.needsToBePlayed(
      suitIndex,
      rank,
      deck,
      playStacks,
      playStackDirections,
      variant,
    );
  }

  const total = (s: number, r: number) => deckRules.numCopiesOfCard(
    variant.suits[s],
    r,
    variant,
  );
  const discarded = (s: number, r: number) => deckRules.discardedCopies(deck, s, r);
  const isAllDiscarded = (s: number, r: number) => total(s, r) === discarded(s, r);

  // Second, check to see if it is still possible to play this card
  // (the preceding cards in the suit might have already been discarded)
  for (let i = 1; i < rank; i++) {
    if (isAllDiscarded(suitIndex, i)) {
      // The suit is "dead", so this card does not need to be played anymore
      return false;
    }
  }

  // By default, all cards not yet played will need to be played
  return true;
};

export const status = (
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
  const cardNeedsToBePlayed = needsToBePlayed(
    suitIndex,
    rank,
    deck,
    playStacks,
    playStackDirections,
    variant,
  );

  if (cardNeedsToBePlayed) {
    if (isCritical(suitIndex, rank, deck, playStacks, playStackDirections, variant)) {
      return CardStatus.Critical;
    }
    return CardStatus.NeedsToBePlayed;
  }
  return CardStatus.Trash;
};

// This does not mirror any function on the server
export const isCritical = (
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
  if (!needsToBePlayed(suitIndex, rank, deck, playStacks, playStackDirections, variant)) {
    return false;
  }

  // "Up or Down" has some special cases for critical cards
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.isCritical(
      suitIndex,
      rank,
      deck,
      playStackDirections,
      variant,
    );
  }

  const total = deckRules.numCopiesOfCard(
    variant.suits[suitIndex],
    rank,
    variant,
  );
  const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
  return total === discarded + 1;
};

export const isPotentiallyPlayable = (
  card: CardState,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
  for (let suitIndex = 0; suitIndex < card.possibleCards.length; suitIndex++) {
    const possibleCardsOfSuit = card.possibleCards[suitIndex];
    for (let rank = 0; rank < possibleCardsOfSuit.length; rank++) {
      if (
        // It is possible for this card to be this suit and rank combination
        possibleCardsOfSuit[rank] > 0
        && needsToBePlayed(suitIndex, rank, deck, playStacks, playStackDirections, variant)
      ) {
        return true;
      }
    }
  }

  return false;
};
