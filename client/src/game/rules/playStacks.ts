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
  return deck[playStack[playStack.length - 1]].rank ?? UNKNOWN_CARD_RANK;
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
