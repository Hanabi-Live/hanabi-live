// Helper methods for variants where suits may have a different direction than up
// Currently used for "Up Or Down" and "Reversed" variants

import CardState from '../../types/CardState';
import {
  STACK_BASE_RANK,
  START_CARD_RANK,
} from '../../types/constants';
import StackDirection from '../../types/StackDirection';
import Variant from '../../types/Variant';
import * as deckRules from '../deck';
import * as playStacksRules from '../playStacks';
import * as variantRules from '../variant';

// needsToBePlayed returns true if this card still needs to be played
// in order to get the maximum score (taking into account the stack direction)
// (before getting here, we already checked to see if the card has already been played)
export const needsToBePlayed = (
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  cardState: CardState,
) => {
  const direction = stackDirections[cardState.suitIndex!];
  // First, check to see if the stack is already finished
  if (direction === StackDirection.Finished) {
    return false;
  }

  // Second, check to see if this card is dead
  // (meaning that all of a previous card in the suit have been discarded already)
  if (isDead(variant, deck, playStacks, stackDirections, cardState)) {
    return false;
  }

  // The "Up or Down" variants have specific requirements to start the pile
  if (variantRules.isUpOrDown(variant)) {
    // All 2's, 3's, and 4's must be played
    if (cardState.rank === 2 || cardState.rank === 3 || cardState.rank === 4) {
      return true;
    }

    if (cardState.rank === 1) {
    // 1's do not need to be played if the stack is going up
      if (direction === StackDirection.Up) {
        return false;
      }
    } else if (cardState.rank === 5) {
    // 5's do not need to be played if the stack is going down
      if (direction === StackDirection.Down) {
        return false;
      }
    } else if (cardState.rank === START_CARD_RANK) {
    // START cards do not need to be played if there are any cards played on the stack
      const playStack = playStacks[cardState.suitIndex!];
      if (playStack.length > 0) {
        return false;
      }
    }
  }

  return true;
};

// isDead returns true if it is no longer possible to play this card by
// looking to see if all of the previous cards in the stack have been discarded
// (taking into account the stack direction)
const isDead = (
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  cardState: CardState,
) => {
  const { isAllDiscarded } = discardedHelpers(variant, deck);

  // Make a map that shows if all of some particular rank in this suit has been discarded
  const ranks = variant.ranks.slice();
  const allDiscarded = new Map();
  for (const rank of ranks) {
    allDiscarded.set(rank, isAllDiscarded(cardState.suitIndex!, rank));
  }

  // Start by handling the easy cases of up and down
  if (stackDirections[cardState.suitIndex!] === StackDirection.Up) {
    let rank = variantRules.isUpOrDown(variant) ? 2 : 1;
    for (rank; rank < cardState.rank!; rank++) {
      if (allDiscarded.get(rank)) {
        return true;
      }
    }
    return false;
  }
  if (stackDirections[cardState.suitIndex!] === StackDirection.Down) {
    let rank = variantRules.isUpOrDown(variant) ? 4 : 5;
    for (rank; rank > cardState.rank!; rank--) {
      if (allDiscarded.get(rank)) {
        return true;
      }
    }
    return false;
  }

  if (!variantRules.isUpOrDown(variant)) {
    throw new Error('A stack in a "Reversed" variant must always have a defined direction (up or down).');
  }

  // If we got this far, the stack direction is undecided
  // (the previous function handles the case where the stack is finished)
  // Check to see if the entire suit is dead in the case where
  // all 3 of the start cards are discarded
  if (allDiscarded.get(1) && allDiscarded.get(5) && allDiscarded.get(START_CARD_RANK)) {
    return true;
  }

  // If the "START" card is played on the stack,
  // then this card will be dead if all of the 2's and all of the 4's have been discarded
  // (this situation also applies to 3's when no cards have been played on the stack)
  const playStack = playStacks[cardState.suitIndex!];
  const lastPlayedRank = playStacksRules.lastPlayedRank(playStack, deck);
  if (lastPlayedRank === START_CARD_RANK || cardState.rank === 3) {
    if (allDiscarded.get(2) && allDiscarded.get(4)) {
      return true;
    }
  }

  return false;
};

export const isPotentiallyPlayable = (
  variant: Variant,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  stackDirections: readonly StackDirection[],
  cardState: CardState,
) => {
  let potentiallyPlayable = false;
  for (const [suitIndex, rank] of cardState.possibleCardsByClues) {
    const count = cardState.unseenCards[suitIndex][rank];
    if (count === undefined) {
      throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "unseenCards" map for card ${cardState.order}.`);
    }
    if (count === 0) {
      continue;
    }
    const playStack = playStacks[suitIndex];
    const lastPlayedRank = playStacksRules.lastPlayedRank(playStack, deck);

    if (stackDirections[suitIndex] === StackDirection.Undecided) {
      if (lastPlayedRank === STACK_BASE_RANK) {
        // The "START" card has not been played
        if ([START_CARD_RANK, 1, 5].includes(rank)) {
          potentiallyPlayable = true;
          break;
        }
      } else if (lastPlayedRank === START_CARD_RANK) {
        if ([2, 4].includes(rank)) {
          potentiallyPlayable = true;
          break;
        }
      }
    } else if (stackDirections[suitIndex] === StackDirection.Up) {
      const nextRankNeeded = lastPlayedRank! + 1;
      if (rank === nextRankNeeded) {
        potentiallyPlayable = true;
        break;
      }
    } else if (stackDirections[suitIndex] === StackDirection.Down) {
      let nextRankNeeded = lastPlayedRank! - 1;
      if (!variantRules.isUpOrDown(variant) && lastPlayedRank === 0) {
        // Reversed stacks start with 5, except in "Up or Down"
        nextRankNeeded = 5;
      }
      if (rank === nextRankNeeded) {
        potentiallyPlayable = true;
        break;
      }
    } else if (stackDirections[suitIndex] === StackDirection.Finished) {
      // Nothing can play on this stack because it is finished
      continue;
    }
  }

  return potentiallyPlayable;
};

export const isCardCritical = (
  variant: Variant,
  deck: readonly CardState[],
  stackDirections: readonly StackDirection[],
  cardState: CardState,
) : boolean => {
  const { isLastCopy, isAllDiscarded } = discardedHelpers(variant, deck);

  const isThisCritical = isLastCopy(cardState.suitIndex!, cardState.rank!);
  if (!variantRules.isUpOrDown(variant)) {
    return isThisCritical;
  }

  if (!isThisCritical) {
    // There are more copies of this card, so no worries
    return false;
  }

  const direction = stackDirections[cardState.suitIndex!];

  // Start is only critical if all 1's and 5's are discarded
  // and the stack didn't start
  if (cardState.rank === START_CARD_RANK) {
    return direction === StackDirection.Undecided
      && (isAllDiscarded(cardState.suitIndex!, 1) || isAllDiscarded(cardState.suitIndex!, 5));
  }

  // 1's and 5's are only critical to begin if Start is discarded
  if ((cardState.rank === 1 || cardState.rank === 5) && direction === StackDirection.Undecided) {
    return isAllDiscarded(cardState.suitIndex!, START_CARD_RANK);
  }

  // 1's and 5's are critical to end if the direction requires them in the end
  if (cardState.rank === 1) {
    return direction === StackDirection.Down;
  }

  if (cardState.rank === 5) {
    return direction === StackDirection.Up;
  }

  // Default case: all other ranks
  return true;
};
function discardedHelpers(variant: Variant, deck: readonly CardState[]) {
  const total = (s: number, r: number) => deckRules.numCopiesOfCard(variant, variant.suits[s], r);
  const discarded = (s: number, r: number) => deckRules.discardedCopies(deck, s, r);
  const isLastCopy = (s: number, r: number) => total(s, r) === discarded(s, r) + 1;
  const isAllDiscarded = (s: number, r: number) => total(s, r) === discarded(s, r);
  return { isLastCopy, isAllDiscarded };
}
