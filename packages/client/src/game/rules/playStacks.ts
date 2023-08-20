import type { Rank, SuitIndex, Variant } from "@hanabi/data";
import {
  DEFAULT_CARD_RANKS,
  STACK_BASE_RANK,
  START_CARD_RANK,
} from "@hanabi/data";
import type { CardState } from "../types/CardState";
import { StackDirection } from "../types/StackDirection";
import * as variantRules from "./variant";

function lastPlayedRank(
  playStack: readonly number[],
  deck: readonly CardState[],
): Rank | typeof STACK_BASE_RANK | undefined {
  if (playStack.length === 0) {
    return STACK_BASE_RANK;
  }

  const orderOfTopCard = playStack.at(-1);
  if (orderOfTopCard === undefined) {
    return undefined;
  }

  const card = deck[orderOfTopCard];
  if (card === undefined) {
    return undefined;
  }

  return card.rank ?? undefined;
}

export function nextPlayableRanks(
  suitIndex: SuitIndex,
  playStack: readonly number[],
  playStackDirection: StackDirection,
  playStackStarts: ReadonlyArray<Rank | null>,
  variant: Variant,
  deck: readonly CardState[],
): number[] {
  const currentlyPlayedRank = lastPlayedRank(playStack, deck);
  if (currentlyPlayedRank === undefined) {
    return [];
  }

  switch (playStackDirection) {
    case StackDirection.Undecided: {
      if (currentlyPlayedRank === START_CARD_RANK) {
        return [2, 4];
      }

      return [1, 5, START_CARD_RANK];
    }

    case StackDirection.Up: {
      if (!variant.sudoku) {
        // In non-Sudoku variants, the next playable card is just one higher, or 1 if the stack is
        // not stared yet.
        if (currentlyPlayedRank === STACK_BASE_RANK) {
          return [1];
        }

        return [currentlyPlayedRank + 1];
      }

      // In Sudoku variants, determining the next playable ranks is more complicated. If the stack
      // is already started, then we just go up, wrapping around from 5 to 1 (unless the stack was
      // started at 1, in which case 5 will be the last card of this suit). If it is not started, it
      // can be started with any rank that is not the starting rank of another stack yet.
      if (currentlyPlayedRank !== STACK_BASE_RANK) {
        // Note that we first mod by 5 and then add, to obtain values 1 through 5.
        return [(currentlyPlayedRank % 5) + 1];
      }

      // As a special case, we might already know the start of the play stack, even when no cards
      // have been played when this is the last suit. In that case, only the (known) stack start can
      // be played.
      if (playStackStarts[suitIndex] !== null) {
        return [playStackStarts[suitIndex]!];
      }

      return DEFAULT_CARD_RANKS.filter(
        (rank) => !playStackStarts.includes(rank),
      );
    }

    case StackDirection.Down: {
      if (currentlyPlayedRank === STACK_BASE_RANK) {
        return [5];
      }

      return [currentlyPlayedRank - 1];
    }

    case StackDirection.Finished: {
      return [];
    }
  }
}

export function direction(
  suitIndex: SuitIndex,
  playStack: readonly number[],
  deck: readonly CardState[],
  variant: Variant,
): StackDirection {
  if (playStack.length === 5) {
    return StackDirection.Finished;
  }

  if (!variantRules.hasReversedSuits(variant)) {
    return StackDirection.Up;
  }

  if (!variant.upOrDown) {
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
      return StackDirection.Up;
    }

    return suit.reversed ? StackDirection.Down : StackDirection.Up;
  }

  const top = lastPlayedRank(playStack, deck);
  if (top === undefined) {
    throw new Error(
      `Failed to find the last played rank for suit index: ${suitIndex}`,
    );
  }
  if (top === STACK_BASE_RANK || top === START_CARD_RANK) {
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
  const secondCard = deck[playStack.at(-2)!]!.rank;
  return secondCard === 4 ? StackDirection.Down : StackDirection.Up;
}

export function stackStartRank(
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
