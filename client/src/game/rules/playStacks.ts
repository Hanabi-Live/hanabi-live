import { ensureAllCases } from '../../misc';
import { variantRules } from '../rules';
import CardState from '../types/CardState';
import { STACK_BASE_RANK, UNKNOWN_CARD_RANK, START_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';

export const lastPlayedRank = (
  playStack: readonly number[],
  deck: readonly CardState[],
): number => {
  if (playStack.length === 0) {
    return STACK_BASE_RANK;
  }

  const orderOfTopCard = playStack[playStack.length - 1];
  return deck[orderOfTopCard].rank ?? UNKNOWN_CARD_RANK;
};

export const nextRanks = (
  playStack: readonly number[],
  playStackDirection: StackDirection,
  deck: readonly CardState[],
): number[] => {
  const currentlyPlayedRank = lastPlayedRank(playStack, deck);
  if (currentlyPlayedRank === UNKNOWN_CARD_RANK) {
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
      if (currentlyPlayedRank === STACK_BASE_RANK) {
        return [1];
      }
      return [currentlyPlayedRank + 1];
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

    default: {
      ensureAllCases(playStackDirection);
    }
  }

  return [];
};

export const direction = (
  suitIndex: number,
  playStack: readonly number[],
  deck: readonly CardState[],
  variant: Variant,
): StackDirection => {
  if (playStack.length === 5) {
    return StackDirection.Finished;
  }

  if (!variantRules.hasReversedSuits(variant)) {
    return StackDirection.Up;
  }

  if (!variantRules.isUpOrDown(variant)) {
    return variant.suits[suitIndex].reversed ? StackDirection.Down : StackDirection.Up;
  }

  const top = lastPlayedRank(playStack, deck);
  if (top === STACK_BASE_RANK || top === START_CARD_RANK) {
    return StackDirection.Undecided;
  }

  // E.g. if top is 4 and there are 2 cards on the stack, it's going down
  if (top !== playStack.length) {
    return StackDirection.Down;
  }

  if (top !== 3) {
    return StackDirection.Up;
  }

  // The only remaining case is if the top is 3, in which case there will always be 3 cards
  const secondCard = deck[playStack[playStack.length - 2]].rank;
  return secondCard === 4 ? StackDirection.Down : StackDirection.Up;
};
