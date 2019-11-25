/*
    These are helper functions that convert objects to the integers that the server expects
    and vice versa
*/

// Imports
import Clue from './Clue';
import MsgClue from './MsgClue';
import Suit from '../../Suit';
import Variant from '../../Variant';
import { CLUE_TYPE } from '../../constants';

// Convert a clue to the format used by the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export const clueToMsgClue = (clue: Clue, variant: Variant) => {
    let msgClueValue;
    if (clue.type === CLUE_TYPE.COLOR) {
        msgClueValue = variant.clueColors.findIndex((color) => color === clue.value);
    } else if (clue.type === CLUE_TYPE.RANK) {
        if (typeof clue.value !== 'number') {
            throw new Error('The value of a rank clue is not a number.');
        }
        msgClueValue = clue.value;
    } else {
        throw new Error('Unknown clue type given to the "clueToMsgClue()" function.');
    }
    return new MsgClue(clue.type, msgClueValue);
};

export const msgClueToClue = (msgClue: MsgClue, variant: Variant) => {
    let clueValue;
    if (msgClue.type === CLUE_TYPE.COLOR) {
        clueValue = variant.clueColors[msgClue.value]; // This is a Color object
    } else if (msgClue.type === CLUE_TYPE.RANK) {
        clueValue = msgClue.value;
    } else {
        throw new Error('Unknown clue type given to the "msgClueToClue()" function.');
    }
    return new Clue(msgClue.type, clueValue);
};

export const msgSuitToSuit = (msgSuit: number, variant: Variant) => variant.suits[msgSuit] || null;

export const suitToMsgSuit = (suit: Suit, variant: Variant) => variant.suits.indexOf(suit);
