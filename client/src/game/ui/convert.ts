// These are helper functions that convert objects to the integers that the server expects and
// vice versa

import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import Color from '../types/Color';
import MsgClue from '../types/MsgClue';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

// Convert a clue from the format used by the server to the format used by the client
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export const msgClueToClue = (msgClue: MsgClue, variant: Variant) => {
  let clueValue;
  if (msgClue.type === ClueType.Color) {
    clueValue = variant.clueColors[msgClue.value]; // This is a Color object
    return colorClue(clueValue);
  } if (msgClue.type === ClueType.Rank) {
    clueValue = msgClue.value;
    return rankClue(clueValue);
  }
  throw new Error('Unknown clue type given to the "msgClueToClue()" function.');
};

export const suitIndexToSuit = (
  suitIndex: number | null,
  variant: Variant,
) => {
  if (
    suitIndex === null
    || suitIndex < 0
    || suitIndex >= variant.suits.length
  ) {
    return null;
  }

  return variant.suits[suitIndex];
};

export const suitToSuitIndex = (
  suit: Suit | null,
  variant: Variant,
) => (suit ? variant.suits.indexOf(suit) : -1);

export const colorToColorIndex = (
  color: Color,
  variant: Variant,
) => variant.clueColors.findIndex(
  (variantColor) => variantColor === color,
);
