import {
  DEFAULT_CARD_RANKS,
  STACK_BASE_RANK,
  START_CARD_RANK,
  UNKNOWN_CARD_RANK,
  Variant,
} from "@hanabi/data";
import { CardState } from "../types/CardState";
import { StackDirection } from "../types/StackDirection";
import * as variantRules from "./variant";

function lastPlayedRank(
  playStack: readonly number[],
  deck: readonly CardState[],
): number {
  if (playStack.length === 0) {
    return STACK_BASE_RANK;
  }

  const orderOfTopCard = playStack[playStack.length - 1]!;
  return deck[orderOfTopCard]!.rank ?? UNKNOWN_CARD_RANK;
}

export function nextPlayableRanks(
  suitIndex: number,
  playStack: readonly number[],
  playStackDirection: StackDirection,
  playStackStarts: readonly number[],
  variant: Variant,
  deck: readonly CardState[],
): number[] {
  const currentlyPlayedRank = lastPlayedRank(playStack, deck);
  if (currentlyPlayedRank === UNKNOWN_CARD_RANK) {
    return [];
  }

  switch (playStackDirection) {
    case StackDirection.Undecided: {
      // Check that we are in fact in an Up-Or-Down Variant.
      console.assert(variantRules.isUpOrDown(variant));
      if (currentlyPlayedRank === START_CARD_RANK) {
        return [2, 4];
      }
      return [1, 5, START_CARD_RANK];
    }

    case StackDirection.Up: {
      if (!variantRules.isSudoku(variant)) {
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
      if (playStackStarts[suitIndex] !== UNKNOWN_CARD_RANK) {
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
  suitIndex: number,
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

  if (!variantRules.isUpOrDown(variant)) {
    return variant.suits[suitIndex]!.reversed
      ? StackDirection.Down
      : StackDirection.Up;
  }

  const top = lastPlayedRank(playStack, deck);
  if (top === UNKNOWN_CARD_RANK) {
    throw new Error(
      `The last played rank for suit index ${suitIndex} was unknown.`,
    );
  }
  if (top === STACK_BASE_RANK || top === START_CARD_RANK) {
    return StackDirection.Undecided;
  }

  // e.g. if top is 4 and there are 2 cards on the stack, it's going down.
  if (top !== playStack.length) {
    return StackDirection.Down;
  }

  if (top !== 3) {
    return StackDirection.Up;
  }

  // The only remaining case is if the top is 3, in which case there will always be 3 cards.
  const secondCard = deck[playStack[playStack.length - 2]!]!.rank;
  return secondCard === 4 ? StackDirection.Down : StackDirection.Up;
}

export function stackStartRank(
  playStack: readonly number[],
  deck: readonly CardState[],
  variant: Variant,
): number {
  if (!variantRules.isSudoku(variant)) {
    return 1;
  }

  const bottomCardOrder = playStack[0];
  if (bottomCardOrder === undefined) {
    return UNKNOWN_CARD_RANK;
  }

  const bottomCard = deck[bottomCardOrder];
  if (bottomCard === undefined) {
    return UNKNOWN_CARD_RANK;
  }

  return bottomCard.rank ?? UNKNOWN_CARD_RANK;
}
