// Helper methods for variants where suits may have a different direction than up. Currently used
// for "Up Or Down" and "Reversed" variants.

import type { NumSuits, Rank, SuitIndex, Variant } from "@hanabi/data";
import { START_CARD_RANK } from "@hanabi/data";
import type { CardState, GameState } from "@hanabi/game";
import { StackDirection } from "@hanabi/game";
import type { Tuple } from "isaacscript-common-ts";
import { eRange, iRange, newArray } from "isaacscript-common-ts";
import { discardedHelpers, getAllDiscardedSet } from "./discardHelpers";

/**
 * Returns true if this card still needs to be played in order to get the maximum score (taking the
 * stack direction into account). (Before reaching this function, we have already checked to see if
 * the card has been played.) This function mirrors the server function
 * "variantReversibleNeedsToBePlayed()".
 */
export function needsToBePlayed(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): boolean {
  const direction = playStackDirections[suitIndex];
  // First, check to see if the stack is already finished.
  if (direction === StackDirection.Finished) {
    return false;
  }

  // Second, check to see if this card is dead. (Meaning that all of a previous card in the suit
  // have been discarded already.)
  if (isDead(suitIndex, rank, deck, playStackDirections, variant)) {
    return false;
  }

  // The "Up or Down" variants have specific requirements to start the pile.
  if (variant.upOrDown) {
    switch (rank) {
      case 1: {
        // 1's do not need to be played if the stack is going up.
        return direction !== StackDirection.Up;
      }

      case 2:
      case 3:
      case 4: {
        // All 2's, 3's, and 4's must be played.
        return true;
      }

      case 5: {
        // 5's do not need to be played if the stack is going down.
        return direction !== StackDirection.Down;
      }

      case START_CARD_RANK: {
        // START cards only need to be played if there 0 cards the stack.
        const playStack = playStacks[suitIndex];
        if (playStack === undefined) {
          return false;
        }

        return playStack.length === 0;
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
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
) {
  const allDiscardedSet = getAllDiscardedSet(variant, deck, suitIndex);

  // We denote by this either the true direction or the only remaining direction in case we already
  // lost the necessary cards for the other direction in "Up or Down".
  let impliedDirection = playStackDirections[suitIndex];

  if (
    impliedDirection === StackDirection.Undecided &&
    allDiscardedSet.has(START_CARD_RANK)
  ) {
    // Get rid of the trivial case where the whole suit is dead.
    if (
      allDiscardedSet.has(START_CARD_RANK) &&
      allDiscardedSet.has(1) &&
      allDiscardedSet.has(5)
    ) {
      return true;
    }
    if (allDiscardedSet.has(5)) {
      impliedDirection = StackDirection.Up;
    } else if (allDiscardedSet.has(1)) {
      impliedDirection = StackDirection.Down;
    }
  }

  // Now we can handle both the regular / reversed and the easy "Up or Down" cases.
  if (impliedDirection === StackDirection.Up) {
    // Note that in Up or Down, having `impliedDirection === StackDirection.Up` also proves that one
    // of Start or 1 is still alive, since we filtered out the case where all of 1, 5, and Start are
    // dead already.
    const lowestNextRank = variant.upOrDown ? 2 : 1;
    for (const nextRank of eRange(lowestNextRank, rank)) {
      if (allDiscardedSet.has(nextRank as Rank)) {
        return true;
      }
    }

    return false;
  }

  if (impliedDirection === StackDirection.Down) {
    // The above comment also applies for `StackDirection.Down`.
    const highestNextRank = variant.upOrDown ? 4 : 5;
    for (let nextRank = highestNextRank; nextRank > rank; nextRank--) {
      if (allDiscardedSet.has(nextRank as Rank)) {
        return true;
      }
    }

    return false;
  }

  // If we got this far, the stack direction is undecided and we could still start the stack from
  // both directions. (The previous function handles the case where the stack is finished.)
  // Therefore, 2's and 4's can both be played by starting the stack in the corresponding direction.
  // The only possible card that could still be dead is a 3, which only happens if we lost all 2's
  // and 4's.
  return allDiscardedSet.has(2) && allDiscardedSet.has(4) && rank === 3;
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
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): Tuple<number, NumSuits> {
  const maxScorePerStack = newArray(variant.suits.length, 0);

  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;

    const allDiscardedSet = getAllDiscardedSet(variant, deck, suitIndex);

    const stackDirection = playStackDirections[suitIndex];
    if (stackDirection === undefined) {
      continue;
    }

    switch (stackDirection) {
      case StackDirection.Undecided: {
        const upWalk = walkUp(allDiscardedSet, variant);
        const downWalk = walkDown(allDiscardedSet, variant);
        maxScorePerStack[suitIndex] += Math.max(upWalk, downWalk);

        break;
      }

      case StackDirection.Up: {
        maxScorePerStack[suitIndex] += walkUp(allDiscardedSet, variant);

        break;
      }

      case StackDirection.Down: {
        maxScorePerStack[suitIndex] += walkDown(allDiscardedSet, variant);

        break;
      }

      case StackDirection.Finished: {
        maxScorePerStack[suitIndex] += variant.stackSize;

        break;
      }
    }
  }

  return maxScorePerStack as Tuple<number, NumSuits>;
}

/** A helper function for `getMaxScore`. */
function walkUp(allDiscardedSet: ReadonlySet<Rank>, variant: Variant): number {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started.
  if (variant.upOrDown) {
    // In "Up or Down" variants, you can start with 1 or START when going up.
    if (allDiscardedSet.has(1) && allDiscardedSet.has(START_CARD_RANK)) {
      return 0;
    }
  } else if (allDiscardedSet.has(1)) {
    // Otherwise, only 1.
    return 0;
  }
  cardsThatCanStillBePlayed++;

  // Second, walk upwards.
  for (const rank of iRange(2, 5)) {
    if (allDiscardedSet.has(rank as Rank)) {
      break;
    }
    cardsThatCanStillBePlayed++;
  }

  return cardsThatCanStillBePlayed;
}

/** A helper function for `getMaxScore`. */
function walkDown(allDiscardedSet: ReadonlySet<Rank>, variant: Variant) {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started.
  if (variant.upOrDown) {
    if (allDiscardedSet.has(5) && allDiscardedSet.has(START_CARD_RANK)) {
      // In "Up or Down" variants, you can start with 5 or START when going down.
      return 0;
    }
  } else if (allDiscardedSet.has(5)) {
    // Otherwise, only 5.
    return 0;
  }
  cardsThatCanStillBePlayed++;

  // Second, walk downwards.
  for (let rank = 4; rank >= 1; rank--) {
    if (allDiscardedSet.has(rank as Rank)) {
      break;
    }
    cardsThatCanStillBePlayed++;
  }

  return cardsThatCanStillBePlayed;
}

/** This does not mirror any function on the server. */
export function isCritical(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): boolean {
  const { isLastCopy, isAllDiscarded } = discardedHelpers(variant, deck);

  const lastCopy = isLastCopy(suitIndex, rank);
  if (!variant.upOrDown) {
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
