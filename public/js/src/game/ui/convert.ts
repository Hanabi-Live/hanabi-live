/*
    These are helper functions that convert objects to the integers that the server expects
    and vice versa
*/

// Imports
import Clue from './Clue';
import Suit from '../../Suit';
import Variant from '../../Variant';
import { CLUE_TYPE } from '../../constants';

// Convert a clue to the format used by the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export const clueToMsgClue = (clue: Clue, variant: Variant) => {
    const {
        type: clueType,
        value: clueValue,
    } = clue;
    let msgClueValue;
    if (clueType === CLUE_TYPE.COLOR) {
        const clueColor = clueValue;
        msgClueValue = variant.clueColors.findIndex((color) => color === clueColor);
    } else if (clueType === CLUE_TYPE.RANK) {
        msgClueValue = clueValue;
    }
    return {
        type: clueType,
        value: msgClueValue,
    };
};

interface MsgClue {
    type: number,
    value: number,
}

export const msgClueToClue = (msgClue: MsgClue, variant: Variant) => {
    const {
        type: clueType,
        value: msgClueValue,
    } = msgClue;
    let clueValue;
    if (clueType === CLUE_TYPE.COLOR) {
        clueValue = variant.clueColors[msgClueValue];
    } else if (clueType === CLUE_TYPE.RANK) {
        clueValue = msgClueValue;
    } else {
        throw new Error('Unknown clue type.');
    }
    return new Clue(clueType, clueValue);
};

export const msgSuitToSuit = (msgSuit: number, variant: Variant) => variant.suits[msgSuit] || null;

export const suitToMsgSuit = (suit: Suit, variant: Variant) => variant.suits.indexOf(suit);
