/* eslint-disable import/prefer-default-export */

import CardState from '../types/CardState';
import { STACK_BASE_RANK, UNKNOWN_CARD_RANK } from '../types/constants';

export const lastPlayedRank = (
  playStack: readonly number[],
  deck: readonly CardState[],
): number => {
  if (playStack.length === 0) {
    return STACK_BASE_RANK;
  }
  return deck[playStack[playStack.length - 1]].rank ?? UNKNOWN_CARD_RANK;
};
