/* eslint-disable import/prefer-default-export */

import CardState from '../types/CardState';

export function isClued(card: CardState) {
  return card.numPositiveClues > 0;
}
