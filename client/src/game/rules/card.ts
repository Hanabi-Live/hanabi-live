/* eslint-disable import/prefer-default-export */

import { StateCard } from '../types/GameState';

export function isClued(card: StateCard) {
  return card.clues.find((c) => c.positive) !== undefined;
}
