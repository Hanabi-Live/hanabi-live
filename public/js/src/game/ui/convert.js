/*
    These are helper functions that convert objects
*/

// Imports
const constants = require('../../constants');
const Clue = require('./Clue');

// Convert a clue to the format used by the server
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
exports.clueToMsgClue = (clue, variant) => {
    const {
        type: clueType,
        value: clueValue,
    } = clue;
    let msgClueValue;
    if (clueType === constants.CLUE_TYPE.COLOR) {
        const clueColor = clueValue;
        msgClueValue = variant.clueColors.findIndex(color => color === clueColor);
    } else if (clueType === constants.CLUE_TYPE.RANK) {
        msgClueValue = clueValue;
    }
    return {
        type: clueType,
        value: msgClueValue,
    };
};

exports.msgClueToClue = (msgClue, variant) => {
    const {
        type: clueType,
        value: msgClueValue,
    } = msgClue;
    let clueValue;
    if (clueType === constants.CLUE_TYPE.COLOR) {
        clueValue = variant.clueColors[msgClueValue];
    } else if (clueType === constants.CLUE_TYPE.RANK) {
        clueValue = msgClueValue;
    }
    return new Clue(clueType, clueValue);
};

exports.msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit];
