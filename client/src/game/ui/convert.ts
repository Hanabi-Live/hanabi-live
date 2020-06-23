// These are helper functions that convert objects to the integers that the server expects and
// vice versa

import Clue from '../types/Clue';
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
  } else if (msgClue.type === ClueType.Rank) {
    clueValue = msgClue.value;
  } else {
    throw new Error('Unknown clue type given to the "msgClueToClue()" function.');
  }
  return new Clue(msgClue.type, clueValue);
};

export const msgSuitToSuit = (
  msgSuit: number,
  variant: Variant,
) => variant.suits[msgSuit] || null;

export const suitToMsgSuit = (
  suit: Suit | null,
  variant: Variant,
) => (suit ? variant.suits.indexOf(suit) : -1);

export const msgColorToColor = (
  msgColor: number,
  variant: Variant,
) => variant.clueColors[msgColor] || null;

export const colorToMsgColor = (
  color: Color,
  variant: Variant,
) => variant.clueColors.findIndex(
  (variantColor) => variantColor === color,
);
