// Helper methods for variants where suits may have a different direction than up. Currently used
// for "Up Or Down" and "Reversed" variants.

import { DEFAULT_CARD_RANKS, START_CARD_RANK, Variant } from "@hanabi/data";
import { CardState } from "../../types/CardState";
import { StackDirection } from "../../types/StackDirection";
import { discardedHelpers, createAllDiscardedMap } from "./discardHelpers";
import * as deckRules from "../deck";
import * as playStacksRules from "../playStacks";
import * as variantRules from "../variant";

/**
 * Returns true if this card still needs to be played in order to get the maximum score (taking the
 * stack direction into account). (Before reaching this function, we have already checked to see if
 * the card has been played.) This function mirrors the server function
 * "variantReversibleNeedsToBePlayed()".
 */
export function needsToBePlayed(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): boolean {
  const direction = playStackDirections[suitIndex];
  // First, check to see if the stack is already finished.
  if (direction === StackDirection.Finished) {
    return false;
  }

  // Second, check to see if this card is dead. (Meaning that all of a previous card in the suit
  // have been discarded already.)
  if (isDead(suitIndex, rank, deck, playStacks, playStackDirections, variant)) {
    return false;
  }

  // The "Up or Down" variants have specific requirements to start the pile.
  if (variantRules.isUpOrDown(variant)) {
    // All 2's, 3's, and 4's must be played.
    if (rank === 2 || rank === 3 || rank === 4) {
      return true;
    }

    if (rank === 1) {
      // 1's do not need to be played if the stack is going up.
      if (direction === StackDirection.Up) {
        return false;
      }
    } else if (rank === 5) {
      // 5's do not need to be played if the stack is going down.
      if (direction === StackDirection.Down) {
        return false;
      }
    } else if (rank === START_CARD_RANK) {
      // START cards do not need to be played if there are any cards played on the stack.
      const playStack = playStacks[suitIndex]!;
      if (playStack.length > 0) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns true if it is no longer possible to play this card by looking to see if all of the
 * previous cards in the stack have been discarded (taking into account the stack direction). This
 * function mirrors the server function "variantReversibleIsDeadIsDead()".
 */
function isDead(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  variant: Variant,
) {
  const allDiscarded = createAllDiscardedMap(variant, deck, suitIndex);

  // Start by handling the easy cases of up and down.
  if (playStackDirections[suitIndex] === StackDirection.Up) {
    let nextRank = variantRules.isUpOrDown(variant) ? 2 : 1;
    for (nextRank; nextRank < rank; nextRank++) {
      if (allDiscarded.get(nextRank) === true) {
        return true;
      }
    }
    return false;
  }
  if (playStackDirections[suitIndex] === StackDirection.Down) {
    let nextRank = variantRules.isUpOrDown(variant) ? 4 : 5;
    for (nextRank; nextRank > rank; nextRank--) {
      if (allDiscarded.get(nextRank) === true) {
        return true;
      }
    }
    return false;
  }

  if (!variantRules.isUpOrDown(variant)) {
    throw new Error(
      'A stack in a "Reversed" variant must always have a defined direction (up or down).',
    );
  }

  // If we got this far, the stack direction is undecided. (The previous function handles the case
  // where the stack is finished.) Check to see if the entire suit is dead in the case where all 3
  // of the start cards are discarded.
  if (
    allDiscarded.get(1) === true &&
    allDiscarded.get(5) === true &&
    allDiscarded.get(START_CARD_RANK) === true
  ) {
    return true;
  }

  // If the "START" card is played on the stack, then this card will be dead if all of the 2's and
  // all of the 4's have been discarded. (This situation also applies to 3's when no cards have been
  // played on the stack.)
  const playStack = playStacks[suitIndex]!;
  const lastPlayedRank = playStacksRules.lastPlayedRank(playStack, deck);
  if (lastPlayedRank === START_CARD_RANK || rank === 3) {
    if (allDiscarded.get(2) === true && allDiscarded.get(4) === true) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates what the maximum score is, accounting for stacks that cannot be completed due to
 * discarded cards.
 *
 * This function mirrors the server function "variantReversibleGetMaxScore()", except that it
 * creates a per stack array, instead.
 */
export function getMaxScorePerStack(
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): number[] {
  const maxScorePerStack: number[] = new Array(variant.suits.length).fill(
    0,
  ) as number[];

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    const suit = variant.suits[suitIndex]!;

    // Make a map that shows if all of some particular rank in this suit has been discarded.
    const ranks: number[] = [...DEFAULT_CARD_RANKS];
    if (variantRules.isUpOrDown(variant)) {
      ranks.push(START_CARD_RANK);
    }

    const allDiscarded = new Map<number, boolean>();
    for (const rank of ranks) {
      const total = deckRules.numCopiesOfCard(suit, rank, variant);
      const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
      allDiscarded.set(rank, total === discarded);
    }

    if (playStackDirections[suitIndex] === StackDirection.Undecided) {
      const upWalk = walkUp(allDiscarded, variant);
      const downWalk = walkDown(allDiscarded, variant);
      maxScorePerStack[suitIndex] += Math.max(upWalk, downWalk);
    } else if (playStackDirections[suitIndex] === StackDirection.Up) {
      maxScorePerStack[suitIndex] += walkUp(allDiscarded, variant);
    } else if (playStackDirections[suitIndex] === StackDirection.Down) {
      maxScorePerStack[suitIndex] += walkDown(allDiscarded, variant);
    } else if (playStackDirections[suitIndex] === StackDirection.Finished) {
      maxScorePerStack[suitIndex] += 5;
    }
  }

  return maxScorePerStack;
}

// A helper function for "getMaxScore()".
function walkUp(allDiscarded: Map<number, boolean>, variant: Variant) {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started.
  if (variantRules.isUpOrDown(variant)) {
    if (allDiscarded.get(1)! && allDiscarded.get(START_CARD_RANK)!) {
      // In "Up or Down" variants, you can start with 1 or START when going up.
      return 0;
    }
  } else if (allDiscarded.get(1)!) {
    // Otherwise, only 1
    return 0;
  }
  cardsThatCanStillBePlayed++;

  // Second, walk upwards
  for (let rank = 2; rank <= 5; rank++) {
    if (allDiscarded.get(rank)!) {
      break;
    }
    cardsThatCanStillBePlayed++;
  }

  return cardsThatCanStillBePlayed;
}

// A helper function for "getMaxScore()".
function walkDown(allDiscarded: Map<number, boolean>, variant: Variant) {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started.
  if (variantRules.isUpOrDown(variant)) {
    if (allDiscarded.get(5)! && allDiscarded.get(START_CARD_RANK)!) {
      // In "Up or Down" variants, you can start with 5 or START when going down.
      return 0;
    }
  } else if (allDiscarded.get(5)!) {
    // Otherwise, only 5
    return 0;
  }
  cardsThatCanStillBePlayed++;

  // Second, walk downwards
  for (let rank = 4; rank >= 1; rank--) {
    if (allDiscarded.get(rank)!) {
      break;
    }
    cardsThatCanStillBePlayed++;
  }

  return cardsThatCanStillBePlayed;
}

// This does not mirror any function on the server.
export function isCritical(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): boolean {
  const { isLastCopy, isAllDiscarded } = discardedHelpers(variant, deck);

  const lastCopy = isLastCopy(suitIndex, rank);
  if (!variantRules.isUpOrDown(variant)) {
    return lastCopy;
  }

  if (!lastCopy) {
    // There are more copies of this card.
    return false;
  }

  const direction = playStackDirections[suitIndex];

  // The START, 1's and 5's are critical if all copies of either of the other two cards are
  // discarded in an Undecided direction.
  if (
    (rank === 1 || rank === 5 || rank === START_CARD_RANK) &&
    direction === StackDirection.Undecided
  ) {
    return (
      isAllDiscarded(suitIndex, START_CARD_RANK) ||
      isAllDiscarded(suitIndex, 1) ||
      isAllDiscarded(suitIndex, 5)
    );
  }

  // 1's and 5's are critical to end if the direction requires them in the end.
  if (rank === 1) {
    return direction === StackDirection.Down;
  }

  if (rank === 5) {
    return direction === StackDirection.Up;
  }

  // Default case: all other ranks
  return true;
}

