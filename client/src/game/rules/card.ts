/* eslint-disable import/prefer-default-export */

import { playStacksRules } from '../rules';
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
  if (playStacks[suitIndex].some((order) => deck[order].rank === rank)) {
    return false;
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
    if (isCritical(suitIndex, rank, deck, playStackDirections, variant)) {
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
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) => {
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

// isPotentiallyPlayable checks to see if every card possibility would misplay if the card was
// played right now
export const isPotentiallyPlayable = (
  card: CardState,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
) => {
  for (const [suitIndex, rank] of card.possibleCardsFromClues) {
    if (card.possibleCardsFromObservation[suitIndex][rank] === 0) continue;
    const nextRanksArray = playStacksRules.nextRanks(
      playStacks[suitIndex],
      playStackDirections[suitIndex],
      deck,
    );
    if (nextRanksArray.includes(rank)) {
      return true;
    }
  }

  return false;
};

export function canPossiblyBe(card: CardState, suitIndex: number | null, rank: number | null) {
  if (suitIndex === null && rank === null) {
    // We have nothing to check
    return true;
  }
  return card.possibleCardsFromClues.some(
    ([s, r]) => (suitIndex === null || suitIndex === s) && (rank === null || rank === r)
      && card.possibleCardsFromObservation[s][r] > 0,
  );
}
