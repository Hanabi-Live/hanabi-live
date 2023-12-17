/* eslint-disable unicorn/no-null */

import type { Rank, SuitIndex, Variant } from "@hanabi/data";
import { START_CARD_RANK } from "@hanabi/data";
import { StackDirection } from "../enums/StackDirection";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import { hasReversedSuits } from "./variants/variantIdentity";

/**
 * Returns an array since it is possible in some variants to have two or more possible cards that
 * are legal next plays.
 */
export function getNextPlayableRanks(
  suitIndex: SuitIndex,
  playStack: readonly number[],
  playStackDirection: StackDirection,
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
  deck: readonly CardState[],
): readonly number[] {
  const currentlyPlayedRank = getLastPlayedRank(playStack, deck);

  switch (playStackDirection) {
    case StackDirection.Undecided: {
      return currentlyPlayedRank === START_CARD_RANK
        ? [2, 4]
        : [1, 5, START_CARD_RANK];
    }

    case StackDirection.Up: {
      if (!variant.sudoku) {
        // In non-Sudoku variants, the next playable card is 1 if the stack is not stared yet or the
        // N+1 rank.
        return currentlyPlayedRank === null ? [1] : [currentlyPlayedRank + 1];
      }

      // In Sudoku variants, determining the next playable ranks is more complicated. If the stack
      // is already started, then we go up, wrapping around from 5 to 1 (unless the stack was
      // started at 1, in which case 5 will be the last card of this suit).
      if (currentlyPlayedRank !== null) {
        // We mod by the stack size and then add to obtain values [1, ..., stackSize].
        return [(currentlyPlayedRank % variant.stackSize) + 1];
      }

      // The stack is not started yet. As a special case, we might already know the start of the
      // play stack, even when no cards have been played when this is the last suit. In that case,
      // only the (known) stack start can be played.
      const playStackStart = playStackStarts[suitIndex];
      if (playStackStart !== undefined && playStackStart !== null) {
        return [playStackStart];
      }

      // If the stack is not started, it can be started with any rank that is not the starting rank
      // of another stack.
      return variant.ranks.filter((rank) => !playStackStarts.includes(rank));
    }

    case StackDirection.Down: {
      // In non-Sudoku variants, the next playable card is 5 if the stack is not stared yet or the
      // N-1 rank.
      return currentlyPlayedRank === null ? [5] : [currentlyPlayedRank - 1];
    }

    case StackDirection.Finished: {
      return [];
    }
  }
}

/** @returns `undefined` if there are no cards played on the stack. */
function getLastPlayedRank(
  playStack: readonly number[],
  deck: readonly CardState[],
): Rank | null {
  const orderOfTopCard = playStack.at(-1);
  if (orderOfTopCard === undefined) {
    return null;
  }

  const card = deck[orderOfTopCard];
  if (card === undefined) {
    return null;
  }

  return card.rank;
}

export function getStackDirection(
  suitIndex: SuitIndex,
  playStack: readonly number[],
  deck: readonly CardState[],
  variant: Variant,
): StackDirection {
  if (playStack.length === variant.stackSize) {
    return StackDirection.Finished;
  }

  if (!hasReversedSuits(variant)) {
    return StackDirection.Up;
  }

  if (!variant.upOrDown) {
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
      return StackDirection.Up;
    }

    return suit.reversed ? StackDirection.Down : StackDirection.Up;
  }

  const top = getLastPlayedRank(playStack, deck);
  if (top === null || top === START_CARD_RANK) {
    return StackDirection.Undecided;
  }

  // e.g. If top is 4 and there are 2 cards on the stack, it's going down.
  if (top !== playStack.length) {
    return StackDirection.Down;
  }

  if (top !== 3) {
    return StackDirection.Up;
  }

  // The only remaining case is if the top is 3, in which case there will always be 3 cards.
  const secondCardOrder = playStack[1];
  if (secondCardOrder === undefined) {
    return StackDirection.Up;
  }

  const secondCard = deck[secondCardOrder];
  if (secondCard === undefined) {
    return StackDirection.Up;
  }

  return secondCard.rank === 2 ? StackDirection.Up : StackDirection.Down;
}

/** Returns the rank of the bottom card of the stack. */
export function getStackStartRank(
  playStack: readonly number[],
  deck: readonly CardState[],
): Rank | null {
  const bottomCardOrder = playStack[0];
  if (bottomCardOrder === undefined) {
    return null;
  }

  const bottomCard = deck[bottomCardOrder];
  if (bottomCard === undefined) {
    return null;
  }

  return bottomCard.rank;
}
