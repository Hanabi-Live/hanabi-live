// Helper methods for variants where suits may have a different direction than up. This is currently
// used for "Up Or Down" and "Reversed" variants.

import type { Tuple } from "complete-common";
import { iRange, newArray } from "complete-common";
import { START_CARD_RANK } from "../../constants";
import { StackDirection } from "../../enums/StackDirection";
import type { CardState } from "../../interfaces/CardState";
import type { GameState } from "../../interfaces/GameState";
import type { Variant } from "../../interfaces/Variant";
import type { NumSuits } from "../../types/NumSuits";
import type { Rank } from "../../types/Rank";
import type { SuitIndex } from "../../types/SuitIndex";
import { getAllDiscardedSetForSuit, getDiscardHelpers } from "../deck";
import { getLastPlayedRank } from "../playStacks";

/**
 * Returns true if this card still needs to be played in order to get the maximum score (taking the
 * stack direction into account). (Before reaching this function, we have already checked to see if
 * the card has been played.) This function mirrors the server function
 * "variantReversibleNeedsToBePlayed()".
 */
export function reversibleIsCardNeededForMaxScore(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): boolean {
  const playStack = playStacks[suitIndex];
  if (playStack === undefined) {
    return false;
  }
  const lastPlayedRank = getLastPlayedRank(playStack, deck);
  const allDiscardedSet = getAllDiscardedSetForSuit(variant, deck, suitIndex);
  const direction = playStackDirections[suitIndex];
  const usefulRanks = reversibleGetRanksUsefulForMaxScore(
    lastPlayedRank,
    allDiscardedSet,
    direction,
  );
  return usefulRanks.has(rank);
}

export function reversibleGetRanksUsefulForMaxScore(
  lastPlayed: Rank | null,
  allDiscardedSet: ReadonlySet<Rank>,
  direction: StackDirection | undefined,
): ReadonlySet<Rank> {
  if (direction === StackDirection.Undecided) {
    const upSet = reversibleGetRanksUsefulForMaxScore(
      lastPlayed,
      allDiscardedSet,
      StackDirection.Up,
    );
    const downSet = reversibleGetRanksUsefulForMaxScore(
      lastPlayed,
      allDiscardedSet,
      StackDirection.Down,
    );
    return new Set<Rank>([...upSet, ...downSet]);
  }
  const ranksSet = new Set<Rank>();
  if (direction === StackDirection.Finished) {
    return ranksSet;
  }
  if (direction === StackDirection.Up) {
    // We first deal with S and 1, if both are discarded then no other cards can be played:
    if (allDiscardedSet.has(START_CARD_RANK) && allDiscardedSet.has(1)) {
      return ranksSet;
    }
    let nextToPlay = 2;
    if (lastPlayed === null) {
      ranksSet.add(1);
      ranksSet.add(START_CARD_RANK);
    } else if (lastPlayed !== START_CARD_RANK) {
      nextToPlay = lastPlayed + 1;
    }
    // Then we walk up from `nextToPlay` (at least 2 as we dealt with S and 1 already):
    for (let rank = nextToPlay; rank <= 5; rank++) {
      if (allDiscardedSet.has(rank as Rank)) {
        break;
      } else {
        ranksSet.add(rank as Rank);
      }
    }
  }

  // Same logic than Up, but reversed.
  if (direction === StackDirection.Down) {
    if (allDiscardedSet.has(START_CARD_RANK) && allDiscardedSet.has(5)) {
      return ranksSet;
    }
    let nextToPlay = 4;
    if (lastPlayed === null) {
      ranksSet.add(5);
      ranksSet.add(START_CARD_RANK);
    } else if (lastPlayed !== START_CARD_RANK) {
      nextToPlay = lastPlayed - 1;
    }
    for (let rank = nextToPlay; rank >= 1; rank--) {
      if (allDiscardedSet.has(rank as Rank)) {
        break;
      } else {
        ranksSet.add(rank as Rank);
      }
    }
  }

  return ranksSet;
}

/**
 * Calculates what the maximum score is, accounting for stacks that cannot be completed due to
 * discarded cards.
 *
 * This function mirrors the server function "variantReversibleGetMaxScore()", except that it
 * creates a per stack array, instead.
 */
export function reversibleGetMaxScorePerStack(
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): Tuple<number, NumSuits> {
  const maxScorePerStack = newArray(variant.suits.length, 0) as Tuple<
    number,
    NumSuits
  >;

  for (const i of variant.suits.keys()) {
    const suitIndex = i as SuitIndex;

    const allDiscardedSet = getAllDiscardedSetForSuit(variant, deck, suitIndex);

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

  return maxScorePerStack;
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
export function reversibleIsCardCritical(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  variant: Variant,
): boolean {
  const { isLastCopy, isAllDiscarded } = getDiscardHelpers(variant, deck);

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
    (rank === 1 || rank === 5 || rank === START_CARD_RANK)
    && direction === StackDirection.Undecided
  ) {
    return (
      isAllDiscarded(suitIndex, START_CARD_RANK)
      || isAllDiscarded(suitIndex, 1)
      || isAllDiscarded(suitIndex, 5)
    );
  }

  // 1's and 5's are critical to end if the direction requires them in the end.
  if (rank === 1) {
    return direction === StackDirection.Down;
  }

  if (rank === 5) {
    return direction === StackDirection.Up;
  }

  // The default case is all other ranks.
  return true;
}
