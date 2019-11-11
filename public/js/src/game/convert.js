/*
    These are helper functions that convert objects to the integers that the server expects
    and vice versa
*/

// Imports
import Clue from './Clue';
import { CLUE_TYPE } from '../constants';

// Convert a clue to the format used by the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export const clueToMsgClue = (clue, variant) => {
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

export const msgClueToClue = (msgClue, variant) => {
    const {
        type: clueType,
        value: msgClueValue,
    } = msgClue;
    let clueValue;
    if (clueType === CLUE_TYPE.COLOR) {
        clueValue = variant.clueColors[msgClueValue];
    } else if (clueType === CLUE_TYPE.RANK) {
        clueValue = msgClueValue;
    }
    return new Clue(clueType, clueValue);
};

export const msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit] || null;

export const suitToMsgSuit = (suit, variant) => variant.suits.indexOf(suit);
